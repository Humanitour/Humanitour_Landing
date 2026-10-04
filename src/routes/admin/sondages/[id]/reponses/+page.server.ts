import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { requirePermission } from '$lib/server/rbac/guard';
import {
	pageWindow,
	readFilter,
	responseCells,
	tallyQuestion,
	type BrowseQuestion
} from '$lib/server/survey/browse';
import { getQuestionType } from '$lib/shared/questions';
import type { PageServerLoad } from './$types';

/** Repondants par page : assez pour parcourir, pas assez pour alourdir la page. */
const PAGE_SIZE = 50;

/**
 * Les reponses d'une enquete, telles que le miroir les tient.
 *
 * Deux lectures sur la meme population : le decompte de chaque question, et
 * le tableau repondant par repondant. Choisir une modalite dans le decompte
 * restreint les deux a ceux qui l'ont donnee, ce qui suffit a relire un
 * croisement sans passer par l'explorateur public.
 */
export const load: PageServerLoad = async ({ params, locals, url }) => {
	requirePermission(locals.user, 'survey.read');

	const survey = await prisma.survey.findUnique({
		where: { id: params.id },
		select: {
			id: true,
			title: true,
			openformsSyncedAt: true,
			questions: {
				orderBy: { position: 'asc' },
				include: { options: { orderBy: { position: 'asc' } } }
			}
		}
	});
	if (!survey) error(404, { message: 'Sondage introuvable.' });

	const questions: BrowseQuestion[] = survey.questions.map((question) => ({
		id: question.id,
		code: question.code,
		label: question.label,
		modalities:
			getQuestionType(question.type)?.modalities({
				config: (question.config ?? {}) as Record<string, unknown>,
				options: question.options
			}) ?? []
	}));

	const filter = readFilter(questions, url.searchParams.get('q'), url.searchParams.get('m'));
	const population = {
		surveyId: survey.id,
		...(filter
			? { answers: { some: { questionId: filter.questionId, modalityKey: filter.modalityKey } } }
			: {})
	};

	const [total, filtered, rows] = await Promise.all([
		prisma.response.count({ where: { surveyId: survey.id } }),
		prisma.response.count({ where: population }),
		prisma.answer.findMany({
			where: { response: population },
			select: { questionId: true, responseId: true, modalityKey: true }
		})
	]);

	const window = pageWindow(url.searchParams.get('page'), filtered, PAGE_SIZE);
	const responses = await prisma.response.findMany({
		where: population,
		orderBy: [{ collectedAt: 'desc' }, { id: 'asc' }],
		skip: window.skip,
		take: window.take,
		select: {
			id: true,
			collectedAt: true,
			answers: {
				select: { questionId: true, modalityKey: true, valueNumber: true, valueText: true }
			}
		}
	});

	const rowsByQuestion = Map.groupBy(rows, (row) => row.questionId);

	return {
		survey: { id: survey.id, title: survey.title, syncedAt: survey.openformsSyncedAt },
		total,
		filtered,
		filter,
		window,
		questions: questions.map((question) => ({
			id: question.id,
			code: question.code,
			label: question.label,
			tally: tallyQuestion(question, rowsByQuestion.get(question.id) ?? [], filtered)
		})),
		responses: responses.map((response) => ({
			id: response.id,
			collectedAt: response.collectedAt,
			cells: responseCells(questions, response.answers)
		}))
	};
};
