import { error, fail } from '@sveltejs/kit';
import { recordAudit } from '$lib/server/audit';
import { prisma } from '$lib/server/db';
import { readCheckbox, readPrefixed, readText } from '$lib/server/forms';
import {
	fetchForm,
	fetchPublicForm,
	fetchSummary,
	listForms,
	type RemoteSummary
} from '$lib/server/openforms/api';
import { isConfigured, OpenformsError } from '$lib/server/openforms/client';
import { resetSurveyResponses, syncSurvey } from '$lib/server/openforms/sync';
import { suggestMapping, type MappableField } from '$lib/server/normalize/mapper';
import { planQuestionsFromForm, type ImportPlan } from '$lib/server/openforms/schema-import';
import { requirePermission } from '$lib/server/rbac/guard';
import { inspectForm, type UsabilityReport } from '$lib/shared/openforms/usability';
import { getFieldType } from '$lib/shared/openforms/fields';
import { QUESTION_TYPES } from '$lib/shared/questions';
import type { OpenformsForm } from '$lib/shared/openforms/types';
import type { Actions, PageServerLoad } from './$types';

/**
 * Collecte Openforms d'une enquete.
 *
 * L'ecran repond a trois questions, dans cet ordre, parce que c'est l'ordre
 * dans lequel elles se posent :
 *
 *   1. A quel formulaire cette enquete est-elle reliee, et est-il ouvert ?
 *   2. Quel champ distant alimente quelle question ?
 *   3. Qu'ont rapporte les dernieres passes, et qu'ont-elles refuse ?
 *
 * Les compteurs viennent d'Openforms EN DIRECT, pas du miroir. C'est la seule
 * facon de voir l'ecart entre ce qui a ete collecte la-bas et ce qui a ete
 * repris ici : un ecart durable est le symptome d'une synchronisation en panne,
 * et un chiffre recopie du miroir le masquerait par construction.
 */

/** Un champ proposable a la correspondance, tel que l'ecran le liste. */
interface FieldChoice extends MappableField {
	readonly type: string;
}

/** Ce que l'ecran sait dire quand Openforms ne repond pas. */
interface LiveState {
	readonly summary: RemoteSummary | null;
	readonly fields: readonly FieldChoice[];
	readonly usability: UsabilityReport | null;
	/** Pourquoi les compteurs manquent. `null` s'ils sont la. */
	readonly countersFailure: string | null;
	/** Pourquoi la liste des champs manque. `null` si elle est la. */
	readonly fieldsFailure: string | null;
}

interface Attempt<T> {
	readonly value: T | null;
	readonly failure: string | null;
}

/** Un appel distant qui n'a pas le droit de faire tomber l'ecran. */
async function attempt<T>(read: () => Promise<T>): Promise<Attempt<T>> {
	try {
		return { value: await read(), failure: null };
	} catch (cause) {
		const failure =
			cause instanceof OpenformsError
				? cause.message
				: 'Openforms est injoignable pour une raison inattendue.';
		return { value: null, failure };
	}
}

/**
 * Champs que la synchronisation saurait reprendre.
 *
 * Meme regle que la lecture (`openforms/rows.ts`), moins les champs
 * identifiants : ils n'entrent pas, meme mappes a la main.
 */
function collectableFields(form: OpenformsForm | null): readonly FieldChoice[] {
	return (form?.fields ?? []).flatMap((field) => {
		const type = getFieldType(field.type);
		if (!type?.carriesAnswer || type.identifying) return [];
		return [{ key: field.key, label: field.label, type: type.label }];
	});
}

/**
 * Interroge Openforms sans faire tomber l'ecran.
 *
 * Le back-office doit rester consultable quand le service de formulaires est
 * indisponible : la correspondance des champs et l'historique des passes vivent
 * ici, ils n'ont aucune raison de disparaitre avec lui.
 *
 * TROIS lectures independantes, et c'est le correctif : groupees dans un seul
 * `try`, la vue publique emportait les deux autres dans sa chute. Or elle
 * repond 404 des que le formulaire est depublie, ce qui vidait la liste des
 * champs proposables — la correspondance devenait impossible a etablir, et la
 * synchronisation echouait ensuite faute de question reliee.
 */
async function readLive(formId: string | null, slug: string | null): Promise<LiveState> {
	if (!formId) {
		return {
			summary: null,
			fields: [],
			usability: null,
			countersFailure: null,
			fieldsFailure: null
		};
	}

	const [summary, definition, usability] = await Promise.all([
		attempt(() => fetchSummary(formId)),
		attempt(() => fetchForm(formId)),
		slug
			? attempt(async () => inspectForm(await fetchPublicForm(slug)))
			: Promise.resolve<Attempt<UsabilityReport>>({ value: null, failure: null })
	]);

	return {
		summary: summary.value,
		fields: collectableFields(definition.value),
		usability: usability.value,
		countersFailure: summary.failure,
		fieldsFailure: definition.failure
	};
}

/** Formulaires proposables : ceux qu'aucune autre enquete n'a deja pris. */
async function availableForms(surveyId: string) {
	const [remote, linked] = await Promise.all([
		listForms(),
		prisma.survey.findMany({
			where: { openformsFormId: { not: null }, id: { not: surveyId } },
			select: { openformsFormId: true }
		})
	]);

	const taken = new Set(linked.map((survey) => survey.openformsFormId));
	return remote.filter((form) => !taken.has(form.id));
}

export const load: PageServerLoad = async ({ params }) => {
	const survey = await prisma.survey.findUnique({
		where: { id: params.id },
		select: {
			id: true,
			title: true,
			slug: true,
			openformsFormId: true,
			openformsSlug: true,
			openformsOpen: true,
			openformsSyncedAt: true,
			opensAt: true,
			closesAt: true,
			maxResponses: true,
			_count: { select: { responses: true } }
		}
	});
	if (!survey) error(404, { message: 'Sondage introuvable.' });

	const configured = isConfigured();

	const [questions, syncs, live, forms] = await Promise.all([
		prisma.question.findMany({
			where: { surveyId: params.id },
			orderBy: { position: 'asc' },
			select: { id: true, code: true, label: true, type: true, openformsKey: true }
		}),
		prisma.openformsSync.findMany({
			where: { surveyId: params.id },
			orderBy: { startedAt: 'desc' },
			take: 20,
			include: { triggeredBy: { select: { displayName: true } } }
		}),
		configured ? readLive(survey.openformsFormId, survey.openformsSlug) : Promise.resolve(null),
		configured && !survey.openformsFormId
			? availableForms(params.id).catch(() => [])
			: Promise.resolve([])
	]);

	return {
		configured,
		survey: {
			id: survey.id,
			title: survey.title,
			slug: survey.slug,
			formId: survey.openformsFormId,
			formSlug: survey.openformsSlug,
			open: survey.openformsOpen,
			syncedAt: survey.openformsSyncedAt,
			opensAt: survey.opensAt,
			closesAt: survey.closesAt,
			maxResponses: survey.maxResponses,
			mirrored: survey._count.responses
		},
		questions,
		forms,
		live,
		syncs: syncs.map((sync) => ({
			id: sync.id,
			trigger: sync.trigger,
			status: sync.status,
			fetched: sync.fetchedCount,
			created: sync.createdCount,
			rejected: sync.rejectedCount,
			newsletterSignups: sync.newsletterCount,
			message: sync.message,
			errors: sync.errors as {
				submission: string;
				question: string;
				field: string;
				value: string;
				reason: string;
			}[],
			startedAt: sync.startedAt,
			finishedAt: sync.finishedAt,
			author: sync.triggeredBy?.displayName ?? null
		}))
	};
};

/**
 * Les champs ecartes, en une ligne chacun.
 *
 * Ils se lisent, ils ne se taisent pas : un champ distant sans question est un
 * ecart entre ce qu'Openforms recueille et ce que ce site publie, et c'est
 * exactement le genre d'ecart que l'institut reproche aux autres de laisser
 * dans l'ombre.
 */
function describeSkipped(plan: ImportPlan): string[] {
	return plan.skipped.map((entry) => `« ${entry.label} » — ${entry.reason}`);
}

/**
 * Cree les questions manquantes a partir du formulaire distant.
 *
 * Openforms porte deja le questionnaire ; le ressaisir ici a la main est un
 * travail de copie, et une occasion de se tromper. La regle de composition est
 * la meme que pour la proposition de correspondance : on ne comble que les
 * trous, on ne retouche rien.
 *
 * Le plan est calcule a part (`openforms/schema-import`), sans base ni reseau.
 * Cette fonction ne fait que l'ecrire.
 */
async function importQuestions(surveyId: string, formId: string): Promise<ImportPlan> {
	const [form, existing] = await Promise.all([
		fetchForm(formId),
		prisma.question.findMany({
			where: { surveyId },
			orderBy: { position: 'asc' },
			select: {
				id: true,
				code: true,
				label: true,
				openformsKey: true,
				position: true,
				options: { select: { code: true, position: true } }
			}
		})
	]);

	const plan = planQuestionsFromForm(
		form.fields,
		existing.map((question) => ({
			code: question.code,
			label: question.label,
			openformsKey: question.openformsKey,
			optionCodes: question.options.map((option) => option.code)
		}))
	);

	// Les modalites apparues depuis la derniere reprise, posees a la suite des
	// existantes : renumeroter celles d'avant deplacerait un ordre d'affichage
	// que quelqu'un a peut-etre regle a la main.
	const byCode = new Map(existing.map((question) => [question.code, question]));

	for (const addition of plan.additions) {
		const question = byCode.get(addition.questionCode);
		if (!question) continue;

		let position = question.options.reduce((max, option) => Math.max(max, option.position), -1);

		await prisma.questionOption.createMany({
			data: addition.options.map((option) => {
				position += 1;
				return {
					questionId: question.id,
					code: option.code,
					label: option.label,
					position,
					isNonResponse: option.isNonResponse,
					color: option.color
				};
			})
		});
	}

	if (plan.drafts.length === 0) return plan;

	let position = existing.reduce((max, question) => Math.max(max, question.position), -1);

	// Une seule transaction : une enquete a moitie peuplee, avec une question sur
	// deux reliee, serait plus penible a rattraper qu'un echec franc.
	await prisma.$transaction(
		plan.drafts.map((draft) => {
			position += 1;
			const definition = QUESTION_TYPES.find((candidate) => candidate.key === draft.type);
			const config = definition?.parseConfig({});

			return prisma.question.create({
				data: {
					surveyId,
					code: draft.code,
					label: draft.label,
					type: draft.type,
					position,
					openformsKey: draft.openformsKey,
					config: config?.ok ? (config.config as never) : {},
					isCrossable: definition?.crossable ?? true,
					options: {
						create: draft.options.map((option) => ({
							code: option.code,
							label: option.label,
							position: option.position,
							isNonResponse: option.isNonResponse,
							color: option.color
						}))
					}
				}
			});
		})
	);

	return plan;
}

/**
 * Propose une correspondance et l'enregistre.
 *
 * Ne comble QUE les trous : une question deja reliee n'est pas touchee, et un
 * champ deja attribue n'est pas repropose. Une proposition qui defait le
 * travail d'un operateur ne vaudrait pas mieux que pas de proposition du tout,
 * et l'unicite (enquete, cle distante) la ferait echouer de toute facon.
 *
 * C'est une PROPOSITION : elle reste corrigeable a l'ecran, et rien n'est
 * synchronise tant que l'operateur n'a pas tranche.
 *
 * @returns le nombre de correspondances ajoutees.
 */
async function proposeMapping(surveyId: string, formId: string): Promise<number> {
	const [form, questions] = await Promise.all([
		fetchForm(formId),
		prisma.question.findMany({
			where: { surveyId },
			orderBy: { position: 'asc' },
			select: { code: true, label: true, openformsKey: true }
		})
	]);

	const taken = new Set(questions.flatMap((question) => question.openformsKey ?? []));

	const proposal = Object.entries(
		suggestMapping(
			collectableFields(form).filter((field) => !taken.has(field.key)),
			questions.filter((question) => question.openformsKey === null)
		)
	);

	if (proposal.length > 0) {
		await prisma.$transaction(
			proposal.map(([code, key]) =>
				prisma.question.update({
					where: { surveyId_code: { surveyId, code } },
					data: { openformsKey: key }
				})
			)
		);
	}

	return proposal.length;
}

export const actions: Actions = {
	/** Relie l'enquete a un formulaire et propose la correspondance des champs. */
	link: async ({ request, params, locals }) => {
		const user = requirePermission(locals.user, 'survey.sync');

		const form = await request.formData();
		const formId = readText(form, 'formId');
		if (!formId) return fail(400, { message: 'Choisissez un formulaire.' });

		const remote = (await availableForms(params.id)).find((entry) => entry.id === formId);
		if (!remote) {
			return fail(400, {
				message:
					"Ce formulaire n'est pas disponible : il est peut-être déjà relié à une autre enquête."
			});
		}

		await prisma.survey.update({
			where: { id: params.id },
			data: {
				openformsFormId: remote.id,
				openformsSlug: remote.slug,
				openformsOpen: remote.isPublished,
				opensAt: remote.startsAt,
				closesAt: remote.endsAt,
				maxResponses: remote.maxResponses
			}
		});

		// Les questions d'abord : une enquete vide reliee a un formulaire rempli
		// n'a rien a quoi faire correspondre, et la minuterie echouerait a chaque
		// tour sans que personne ne comprenne pourquoi.
		let created = 0;
		let skipped: string[] = [];
		try {
			const plan = await importQuestions(params.id, remote.id);
			created = plan.drafts.length;
			skipped = describeSkipped(plan);
		} catch (cause) {
			// La liaison vaut mieux que la reprise du questionnaire : l'operateur
			// pourra la relancer d'un bouton.
			console.error('[openforms] reprise du questionnaire impossible :', cause);
		}

		let suggested = 0;
		try {
			suggested = await proposeMapping(params.id, remote.id);
		} catch (cause) {
			// La liaison vaut mieux qu'une proposition : l'operateur pourra la
			// relancer, ou etablir la correspondance a la main.
			console.error('[openforms] correspondance automatique impossible :', cause);
		}

		await recordAudit({
			actorId: user.id,
			action: 'openforms.link',
			entity: 'Survey',
			entityId: params.id,
			metadata: { formId: remote.id, slug: remote.slug, created, suggested }
		});

		return {
			message: `Formulaire « ${remote.title} » relié. ${created} question(s) reprise(s) du formulaire, ${suggested} correspondance(s) proposée(s) sur les autres. Vérifiez-les avant de synchroniser.`,
			skipped
		};
	},

	/**
	 * Reprend le questionnaire distant sur une enquete deja reliee.
	 *
	 * Le pendant de « proposer la correspondance » : celle-ci relie des questions
	 * existantes, celle-la les cree. Separees, parce qu'une enquete peut avoir
	 * ete ecrite a la main ici avant d'etre reliee la-bas, et que l'operateur
	 * doit pouvoir choisir.
	 */
	importQuestions: async ({ params, locals }) => {
		const user = requirePermission(locals.user, 'survey.write');

		const survey = await prisma.survey.findUnique({
			where: { id: params.id },
			select: { openformsFormId: true }
		});
		if (!survey?.openformsFormId) {
			return fail(400, { message: "Reliez d'abord un formulaire à cette enquête." });
		}

		let plan: ImportPlan;
		try {
			plan = await importQuestions(params.id, survey.openformsFormId);
		} catch (cause) {
			const message =
				cause instanceof OpenformsError
					? cause.message
					: 'Openforms est injoignable pour une raison inattendue.';
			return fail(400, { message });
		}

		await recordAudit({
			actorId: user.id,
			action: 'openforms.import',
			entity: 'Survey',
			entityId: params.id,
			metadata: { formId: survey.openformsFormId, created: plan.drafts.length }
		});

		const skipped = describeSkipped(plan);
		const added = plan.additions.reduce((total, entry) => total + entry.options.length, 0);
		const reconciled =
			added > 0
				? ` ${added} modalité(s) ajoutée(s) à des questions existantes, apparues dans le formulaire depuis la dernière reprise.`
				: '';

		if (plan.drafts.length === 0) {
			const nothing =
				skipped.length > 0
					? 'Aucune question à reprendre : tout le reste du formulaire est déjà relié ou écarté.'
					: 'Aucune question à reprendre : le formulaire est déjà entièrement relié.';

			return { message: added > 0 ? reconciled.trim() : nothing, skipped };
		}

		return {
			message: `${plan.drafts.length} question(s) reprise(s) du formulaire, avec leurs modalités. Relisez-les : les libellés sont ceux d'Openforms.${reconciled}`,
			skipped
		};
	},

	/**
	 * Relance la proposition sur une enquete deja reliee.
	 *
	 * Sans elle, une correspondance ratee a la liaison ne se rattrapait qu'a la
	 * main, question par question, et les questions ajoutees apres coup ne
	 * recevaient jamais de proposition.
	 */
	suggest: async ({ params, locals }) => {
		const user = requirePermission(locals.user, 'survey.sync');

		const survey = await prisma.survey.findUnique({
			where: { id: params.id },
			select: { openformsFormId: true }
		});
		if (!survey?.openformsFormId) {
			return fail(400, { message: "Reliez d'abord un formulaire à cette enquête." });
		}

		let suggested: number;
		try {
			suggested = await proposeMapping(params.id, survey.openformsFormId);
		} catch (cause) {
			const message =
				cause instanceof OpenformsError
					? cause.message
					: 'Openforms est injoignable pour une raison inattendue.';
			return fail(400, { message });
		}

		await recordAudit({
			actorId: user.id,
			action: 'openforms.suggest',
			entity: 'Survey',
			entityId: params.id,
			metadata: { formId: survey.openformsFormId, suggested }
		});

		if (suggested === 0) {
			return {
				message:
					"Aucune correspondance supplémentaire n'a pu être proposée. Les libellés du formulaire et ceux des questions ne se ressemblent pas assez : établissez la correspondance à la main."
			};
		}

		return {
			message: `${suggested} correspondance(s) proposée(s), vérifiez-les avant de synchroniser.`
		};
	},

	/** Enregistre la correspondance champ distant vers question. */
	map: async ({ request, params, locals }) => {
		const user = requirePermission(locals.user, 'survey.sync');

		const form = await request.formData();
		// Chaque champ du formulaire s'appelle « map:<code de question> ».
		const mapping = readPrefixed(form, 'map:');

		const questionCount = await prisma.question.count({ where: { surveyId: params.id } });

		// Une cle distante ne peut alimenter qu'une question : deux questions
		// branchees sur le meme champ compteraient deux fois la meme reponse.
		const used = new Map<string, string>();
		for (const [code, key] of Object.entries(mapping)) {
			if (!key) continue;
			const owner = used.get(key);
			if (owner) {
				return fail(400, {
					message: `Le champ « ${key} » est associé à deux questions (${owner} et ${code}). Choisissez-en une.`
				});
			}
			used.set(key, code);
		}

		/*
		 * DEUX passes, et l'ordre compte.
		 *
		 * `Question` porte une contrainte d'unicite sur (enquete, cle distante), et
		 * PostgreSQL la verifie a chaque instruction, pas en fin de transaction.
		 * Deplacer une cle d'une question a une autre en une seule passe echouait
		 * donc une fois sur deux, selon l'ordre des lignes : la question qui recoit
		 * la cle etait mise a jour avant que celle qui la cede ne l'ait relachee.
		 *
		 * On efface tout d'abord, on reaffecte ensuite. Le tout dans une
		 * transaction, donc aucun etat intermediaire n'est visible.
		 */
		await prisma.$transaction([
			prisma.question.updateMany({
				where: { surveyId: params.id },
				data: { openformsKey: null }
			}),
			...Object.entries(mapping)
				.filter(([, key]) => key)
				.map(([code, key]) =>
					prisma.question.update({
						where: { surveyId_code: { surveyId: params.id, code } },
						data: { openformsKey: key }
					})
				)
		]);

		await recordAudit({
			actorId: user.id,
			action: 'openforms.map',
			entity: 'Survey',
			entityId: params.id,
			metadata: { mapped: used.size, questions: questionCount }
		});

		return { message: `Correspondance enregistrée : ${used.size} question(s) reliée(s).` };
	},

	/** Declenche une passe immediate. */
	sync: async ({ params, locals }) => {
		const user = requirePermission(locals.user, 'survey.sync');

		const outcome = await syncSurvey(params.id, 'MANUAL', user.id);
		if (outcome.failure) return fail(400, { message: outcome.failure });

		const rejected =
			outcome.rejected > 0 ? `, ${outcome.rejected} refusée(s) — voir le détail ci-dessous` : '';

		return {
			message: `${outcome.fetched} soumission(s) lue(s), ${outcome.created} reprise(s)${rejected}.`,
			// Les compteurs a part, et pas seulement dans la phrase : la fenetre
			// de suivi les affiche un par un, et redecouper une phrase pour les
			// retrouver serait une invitation a ce qu'ils divergent.
			outcome: {
				fetched: outcome.fetched,
				created: outcome.created,
				rejected: outcome.rejected,
				newsletterSignups: outcome.newsletterSignups
			}
		};
	},

	/**
	 * Efface les reponses reprises, puis relance une passe si on le demande.
	 *
	 * Reserve a `survey.delete` : le geste retire des chiffres peut-etre deja
	 * publies, et il se confirme en recopiant l'adresse de l'enquete. Un clic
	 * egare ne doit pas vider un jeu de donnees cite ailleurs.
	 */
	reset: async ({ request, params, locals }) => {
		const user = requirePermission(locals.user, 'survey.delete');
		const form = await request.formData();

		const survey = await prisma.survey.findUnique({
			where: { id: params.id },
			select: { slug: true, openformsFormId: true }
		});
		if (!survey) return fail(404, { message: 'Sondage introuvable.' });

		if (readText(form, 'confirm') !== survey.slug) {
			return fail(400, {
				message: `Rien n'a été effacé. Pour confirmer, recopiez exactement l'adresse de l'enquête : ${survey.slug}.`
			});
		}

		const deleted = await resetSurveyResponses(params.id);

		await recordAudit({
			actorId: user.id,
			action: 'openforms.reset',
			entity: 'Survey',
			entityId: params.id,
			metadata: { deleted }
		});

		const cleared = `${deleted} réponse(s) effacée(s), redressement retiré.`;
		if (!readCheckbox(form, 'resync') || !survey.openformsFormId) {
			return { message: `${cleared} Lancez une synchronisation pour les reprendre.` };
		}

		const outcome = await syncSurvey(params.id, 'MANUAL', user.id);
		if (outcome.failure) {
			return fail(400, { message: `${cleared} La reprise a échoué : ${outcome.failure}` });
		}

		const rejected = outcome.rejected > 0 ? `, ${outcome.rejected} refusée(s)` : '';
		return {
			message: `${cleared} Reprise : ${outcome.fetched} soumission(s) lue(s), ${outcome.created} reprise(s)${rejected}.`
		};
	},

	/**
	 * Detache le formulaire.
	 *
	 * Les reponses deja reprises RESTENT : elles sont publiees, et les effacer
	 * parce qu'on change de formulaire ferait disparaitre des chiffres cites
	 * ailleurs. Relier a nouveau le meme formulaire les retrouve telles quelles,
	 * puisque la reference de soumission ne bouge pas.
	 */
	unlink: async ({ params, locals }) => {
		const user = requirePermission(locals.user, 'survey.sync');

		await prisma.survey.update({
			where: { id: params.id },
			data: {
				openformsFormId: null,
				openformsSlug: null,
				openformsOpen: false,
				opensAt: null,
				closesAt: null,
				maxResponses: null
			}
		});

		await recordAudit({
			actorId: user.id,
			action: 'openforms.unlink',
			entity: 'Survey',
			entityId: params.id,
			metadata: {}
		});

		return { message: 'Formulaire détaché. Les réponses déjà reprises restent publiées.' };
	}
};
