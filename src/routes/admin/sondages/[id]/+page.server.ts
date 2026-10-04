import { error, fail } from '@sveltejs/kit';
import { recordAudit } from '$lib/server/audit';
import { prisma } from '$lib/server/db';
import {
	readDate,
	readKeywords,
	readOptionalInt,
	readOptionalText,
	readText
} from '$lib/server/forms';
import { withIgnoredKey } from '$lib/server/openforms/schema-import';
import { requirePermission } from '$lib/server/rbac/guard';
import { readVariables } from '$lib/server/survey/weighting-plan';
import { QUESTION_TYPES, requireQuestionType } from '$lib/shared/questions';
import { toColumnKey } from '$lib/shared/slug';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	requirePermission(locals.user, 'survey.read');

	const survey = await prisma.survey.findUnique({
		where: { id: params.id },
		include: {
			questions: {
				orderBy: { position: 'asc' },
				include: { _count: { select: { options: true, answers: true } } }
			},
			_count: { select: { responses: true } }
		}
	});

	if (!survey) error(404, { message: 'Sondage introuvable.' });

	return {
		survey: {
			id: survey.id,
			slug: survey.slug,
			title: survey.title,
			subtitle: survey.subtitle,
			description: survey.description,
			methodology: survey.methodology,
			status: survey.status,
			fieldworkStart: survey.fieldworkStart,
			fieldworkEnd: survey.fieldworkEnd,
			kAnonymityThreshold: survey.kAnonymityThreshold,
			responseCount: survey._count.responses,
			keywords: survey.keywords,
			geographicCoverage: survey.geographicCoverage,
			collectionMode: survey.collectionMode,
			updateFrequency: survey.updateFrequency,
			metaTitle: survey.metaTitle,
			metaDescription: survey.metaDescription
		},
		questions: survey.questions.map((question) => ({
			id: question.id,
			code: question.code,
			label: question.label,
			type: question.type,
			position: question.position,
			isCrossable: question.isCrossable,
			optionCount: question._count.options,
			answerCount: question._count.answers,
			fromOpenforms: question.openformsKey !== null
		})),
		questionTypes: QUESTION_TYPES.map((type) => ({
			key: type.key,
			label: type.label,
			description: type.description,
			usesOptions: type.usesOptions
		}))
	};
};

export const actions: Actions = {
	metadata: async ({ request, params, locals }) => {
		const user = requirePermission(locals.user, 'survey.write');
		const form = await request.formData();

		const title = readText(form, 'title');
		if (title.length < 3) return fail(400, { message: 'Le titre est obligatoire.' });

		const threshold = readOptionalInt(form, 'kAnonymityThreshold');

		// Un seuil a zero publierait toutes les cases : on refuse plutot que de
		// laisser lever la protection par une faute de frappe.
		if (!threshold.ok) return fail(400, { message: `Seuil d anonymat : ${threshold.reason}` });

		await prisma.survey.update({
			where: { id: params.id },
			data: {
				title,
				subtitle: readOptionalText(form, 'subtitle'),
				description: readOptionalText(form, 'description'),
				methodology: readOptionalText(form, 'methodology'),
				fieldworkStart: readDate(form, 'fieldworkStart'),
				fieldworkEnd: readDate(form, 'fieldworkEnd'),
				kAnonymityThreshold: threshold.value,

				// Fiche du jeu de donnees : ce qu'un reutilisateur doit savoir avant
				// de telecharger. Tout y est facultatif, et ce qui n'est pas
				// renseigne ne s'affiche pas plutot que d'afficher un vide.
				keywords: readKeywords(form, 'keywords'),
				geographicCoverage: readOptionalText(form, 'geographicCoverage'),
				collectionMode: readOptionalText(form, 'collectionMode'),
				updateFrequency: readOptionalText(form, 'updateFrequency'),
				metaTitle: readOptionalText(form, 'metaTitle'),
				metaDescription: readOptionalText(form, 'metaDescription')
			}
		});

		await recordAudit({
			actorId: user.id,
			action: 'survey.update',
			entity: 'Survey',
			entityId: params.id
		});

		return { message: 'Enquete enregistree.' };
	},

	addQuestion: async ({ request, params, locals }) => {
		const user = requirePermission(locals.user, 'survey.write');
		const form = await request.formData();

		const label = readText(form, 'label');
		const type = readText(form, 'type');

		if (label.length < 3)
			return fail(400, { message: 'Le libelle de la question est obligatoire.' });

		const definition = QUESTION_TYPES.find((candidate) => candidate.key === type);
		if (!definition) return fail(400, { message: 'Type de question inconnu.' });

		// Le code est deduit du libelle, puis suffixe en cas de collision. Il entre
		// dans les permaliens de croisement : il ne changera plus ensuite.
		const existing = await prisma.question.findMany({
			where: { surveyId: params.id },
			select: { code: true, position: true }
		});

		const taken = new Set(existing.map((row) => row.code));
		const base = toColumnKey(label).slice(0, 40) || 'question';
		let code = base;
		for (let suffix = 2; taken.has(code); suffix += 1) code = `${base}_${suffix}`;

		const position = existing.reduce((max, row) => Math.max(max, row.position), -1) + 1;
		const config = definition.parseConfig({});

		const question = await prisma.question.create({
			data: {
				surveyId: params.id,
				code,
				label,
				type,
				position,
				config: config.ok ? (config.config as never) : {},
				isCrossable: definition.crossable
			}
		});

		await recordAudit({
			actorId: user.id,
			action: 'question.create',
			entity: 'Question',
			entityId: question.id,
			metadata: { surveyId: params.id, code }
		});

		return { message: `Question « ${label} » ajoutee.` };
	},

	deleteQuestion: async ({ request, params, locals }) => {
		const user = requirePermission(locals.user, 'survey.write');
		const form = await request.formData();
		const questionId = readText(form, 'questionId');

		const question = await prisma.question.findFirst({
			where: { id: questionId, surveyId: params.id },
			include: {
				_count: { select: { answers: true } },
				survey: {
					select: { openformsIgnoredKeys: true, weighting: { select: { variables: true } } }
				}
			}
		});

		if (!question) return fail(404, { message: 'Question introuvable.' });

		// Une variable de calage ne se retire pas en passant : le redressement
		// suivant echouerait sans dire pourquoi.
		const calibrates = readVariables(question.survey.weighting?.variables).some(
			(variable) => variable.questionCode === question.code
		);
		if (calibrates) {
			return fail(400, {
				message: `« ${question.label} » sert de variable de redressement. Retirez-la des marges avant de la supprimer.`
			});
		}

		const cards = await prisma.surveyCard.findMany({
			where: { surveyId: params.id, OR: [{ xCode: question.code }, { yCode: question.code }] },
			select: { title: true }
		});
		if (cards.length > 0) {
			return fail(400, {
				message: `« ${question.label} » porte la carte ${cards.map((card) => `« ${card.title} »`).join(', ')}. Supprimez la carte d'abord.`
			});
		}

		// Supprimer une question emporte ses reponses. Le geste est permis, mais
		// il se confirme en recopiant le code : l'ecran l'annonce avant, pas apres.
		const answers = question._count.answers;
		if (answers > 0 && readText(form, 'confirm') !== question.code) {
			return fail(400, {
				message: `« ${question.label} » porte ${answers} réponse(s). Recopiez son code (${question.code}) pour confirmer leur suppression.`
			});
		}

		// Son champ est ecarte dans le meme geste : sans quoi la prochaine
		// reprise du questionnaire la recreerait, et le menage serait a refaire.
		const key = question.openformsKey;
		await prisma.$transaction([
			prisma.question.delete({ where: { id: questionId } }),
			...(key
				? [
						prisma.survey.update({
							where: { id: params.id },
							data: {
								openformsIgnoredKeys: withIgnoredKey(question.survey.openformsIgnoredKeys, key)
							}
						})
					]
				: [])
		]);

		await recordAudit({
			actorId: user.id,
			action: 'question.delete',
			entity: 'Question',
			entityId: questionId,
			metadata: { surveyId: params.id, code: question.code, answers, ignoredKey: key }
		});

		const ignored = key ? ' Son champ Openforms est écarté : la reprise ne la recréera pas.' : '';
		const erased = answers > 0 ? ` ${answers} réponse(s) effacée(s).` : '';
		return { message: `Question supprimée.${erased}${ignored}` };
	},

	moveQuestion: async ({ request, params, locals }) => {
		requirePermission(locals.user, 'survey.write');
		const form = await request.formData();

		const questionId = readText(form, 'questionId');
		const direction = readText(form, 'direction') === 'up' ? -1 : 1;

		const questions = await prisma.question.findMany({
			where: { surveyId: params.id },
			orderBy: { position: 'asc' },
			select: { id: true, position: true }
		});

		const index = questions.findIndex((question) => question.id === questionId);
		const target = index + direction;
		if (index === -1 || target < 0 || target >= questions.length) {
			return fail(400, { message: 'Deplacement impossible.' });
		}

		const current = questions[index]!;
		const swapped = questions[target]!;

		// Deux ecritures dans une transaction : une position dupliquee, meme une
		// milliseconde, casserait l'ordre d'affichage.
		await prisma.$transaction([
			prisma.question.update({ where: { id: current.id }, data: { position: swapped.position } }),
			prisma.question.update({ where: { id: swapped.id }, data: { position: current.position } })
		]);

		return { message: 'Ordre mis a jour.' };
	},

	toggleCrossable: async ({ request, params, locals }) => {
		requirePermission(locals.user, 'survey.write');
		const form = await request.formData();
		const questionId = readText(form, 'questionId');

		const question = await prisma.question.findFirst({
			where: { id: questionId, surveyId: params.id }
		});
		if (!question) return fail(404, { message: 'Question introuvable.' });

		// Un type non croisable par nature le reste : le reglage ne peut que
		// restreindre, jamais elargir au-dela de ce que le registre autorise.
		if (!requireQuestionType(question.type).crossable) {
			return fail(400, {
				message: `Le type « ${question.type} » n'est jamais croisable : trop de modalites, et risque de reidentification.`
			});
		}

		await prisma.question.update({
			where: { id: questionId },
			data: { isCrossable: !question.isCrossable }
		});

		return { message: 'Reglage mis a jour.' };
	}
};
