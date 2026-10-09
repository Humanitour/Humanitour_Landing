import { error, fail } from '@sveltejs/kit';
import { chartsFor } from '$charts';
import { recordAudit } from '$lib/server/audit';
import { prisma } from '$lib/server/db';
import { readText } from '$lib/server/forms';
import { requirePermission } from '$lib/server/rbac/guard';
import {
	cardSearch,
	COMMENT_MAX,
	describeCards,
	filterChoices,
	parseCardForm,
	readCardFilters,
	TITLE_MAX
} from '$lib/server/survey/selection';
import { interestQuestions } from '$lib/server/survey/weighting-store';
import type { Actions, PageServerLoad } from './$types';

/**
 * La selection de l equipe : les croisements mis en avant sur la fiche de
 * l enquete et sur l accueil.
 *
 * Une carte ne fige aucun chiffre : elle ouvre l explorateur public, avec ses
 * seuils. Elle n est donc visible du public qu une fois publiee, ET seulement
 * si l enquete l est.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	requirePermission(locals.user, 'survey.read');

	const [survey, questions, cards] = await Promise.all([
		prisma.survey.findUnique({
			where: { id: params.id },
			select: { id: true, title: true, slug: true, status: true }
		}),
		interestQuestions(params.id),
		prisma.surveyCard.findMany({ where: { surveyId: params.id }, orderBy: { position: 'asc' } })
	]);
	if (!survey) error(404, { message: 'Sondage introuvable.' });

	const described = new Map(describeCards(cards, questions).map((card) => [card.id, card]));

	return {
		survey,
		limits: { title: TITLE_MAX, comment: COMMENT_MAX },
		questions: questions.map(({ code, label }) => ({ code, label })),
		filterChoices: filterChoices(questions),
		charts: {
			distribution: chartsFor('distribution').map(({ key, label }) => ({ key, label })),
			crosstab: chartsFor('crosstab').map(({ key, label }) => ({ key, label }))
		},
		cards: cards.map((card) => ({
			id: card.id,
			title: card.title,
			comment: card.comment,
			chart: card.chart,
			xCode: card.xCode,
			yCode: card.yCode,
			filters: readCardFilters(card.filters),
			isPublished: card.isPublished,
			// `null` : une question de la carte a disparu, elle ne sera pas publiee.
			described: described.get(card.id) ?? null,
			previewUrl: `/donnees/${survey.slug}?${cardSearch(card)}#explorateur`
		}))
	};
};

/** La carte demandee, si elle appartient bien a cette enquete. */
async function findCard(surveyId: string, form: FormData) {
	return prisma.surveyCard.findFirst({ where: { id: readText(form, 'cardId'), surveyId } });
}

export const actions: Actions = {
	create: async ({ request, params, locals }) => {
		const user = requirePermission(locals.user, 'survey.write');
		const form = await request.formData();

		const parsed = parseCardForm(form, await interestQuestions(params.id));
		if (!parsed.ok) return fail(400, { message: parsed.message });

		const last = await prisma.surveyCard.findFirst({
			where: { surveyId: params.id },
			orderBy: { position: 'desc' },
			select: { position: true }
		});
		const card = await prisma.surveyCard.create({
			data: { ...parsed.value, surveyId: params.id, position: (last?.position ?? -1) + 1 }
		});
		await recordAudit({
			actorId: user.id,
			action: 'survey.card.create',
			entity: 'SurveyCard',
			entityId: card.id,
			metadata: { surveyId: params.id, title: card.title }
		});

		return { message: 'Croisement ajouté à la sélection, non publié.' };
	},

	update: async ({ request, params, locals }) => {
		const user = requirePermission(locals.user, 'survey.write');
		const form = await request.formData();

		const card = await findCard(params.id, form);
		if (!card) return fail(404, { message: 'Croisement introuvable.' });

		const parsed = parseCardForm(form, await interestQuestions(params.id));
		if (!parsed.ok) return fail(400, { message: parsed.message, cardId: card.id });

		await prisma.surveyCard.update({ where: { id: card.id }, data: parsed.value });
		await recordAudit({
			actorId: user.id,
			action: 'survey.card.update',
			entity: 'SurveyCard',
			entityId: card.id,
			metadata: { surveyId: params.id }
		});

		return { message: 'Croisement enregistré.' };
	},

	publish: async ({ request, params, locals }) => {
		const user = requirePermission(locals.user, 'survey.write');
		const form = await request.formData();

		const card = await findCard(params.id, form);
		if (!card) return fail(404, { message: 'Croisement introuvable.' });

		const isPublished = readText(form, 'publish') === 'true';
		await prisma.surveyCard.update({ where: { id: card.id }, data: { isPublished } });
		await recordAudit({
			actorId: user.id,
			action: isPublished ? 'survey.card.publish' : 'survey.card.unpublish',
			entity: 'SurveyCard',
			entityId: card.id,
			metadata: { surveyId: params.id }
		});

		return { message: isPublished ? 'Croisement publié.' : 'Croisement retiré du site.' };
	},

	move: async ({ request, params, locals }) => {
		requirePermission(locals.user, 'survey.write');
		const form = await request.formData();

		const cards = await prisma.surveyCard.findMany({
			where: { surveyId: params.id },
			orderBy: { position: 'asc' },
			select: { id: true }
		});
		const index = cards.findIndex((card) => card.id === readText(form, 'cardId'));
		const target = index + (readText(form, 'direction') === 'up' ? -1 : 1);
		if (index === -1 || target < 0 || target >= cards.length) {
			return fail(400, { message: 'Déplacement impossible.' });
		}

		const ordered = [...cards];
		[ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];

		// Toutes les positions sont reecrites, et non deux echangees : des cartes
		// a egalite de position n auraient sinon rien a echanger.
		await prisma.$transaction(
			ordered.map((card, position) =>
				prisma.surveyCard.update({ where: { id: card.id }, data: { position } })
			)
		);

		return { message: 'Ordre mis à jour.' };
	},

	delete: async ({ request, params, locals }) => {
		const user = requirePermission(locals.user, 'survey.write');
		const form = await request.formData();

		const card = await findCard(params.id, form);
		if (!card) return fail(404, { message: 'Croisement introuvable.' });

		await prisma.surveyCard.delete({ where: { id: card.id } });
		await recordAudit({
			actorId: user.id,
			action: 'survey.card.delete',
			entity: 'SurveyCard',
			entityId: card.id,
			metadata: { surveyId: params.id, title: card.title }
		});

		return { message: 'Croisement retiré de la sélection.' };
	}
};
