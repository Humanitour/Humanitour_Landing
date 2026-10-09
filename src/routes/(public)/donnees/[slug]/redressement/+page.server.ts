import { error } from '@sveltejs/kit';
import { impactOption, marginComparisonOption } from '$lib/charts/echarts/weighting-options';
import { renderedChart } from '$lib/server/charts';
import {
	crossableQuestions,
	getAnswerRows,
	getPublishedSurvey,
	questionModalities,
	resolveThreshold
} from '$lib/server/survey/queries';
import { composeWeightingNote } from '$lib/server/survey/weighting-note';
import {
	compareBySubgroup,
	compareQuestion,
	largestShifts,
	resolveSubgroupSelection,
	type ComparedShare,
	type ReportQuestion
} from '$lib/server/survey/weighting-report';
import {
	loadPublishedWeighting,
	loadWeightingNoteInput,
	loadWeights
} from '$lib/server/survey/weighting-store';
import {
	PARAM_READING,
	PARAM_REPORT_ANSWER,
	PARAM_REPORT_GROUP,
	PARAM_REPORT_QUESTION,
	PARAM_X,
	PARAM_Y,
	WEIGHTED_READING
} from '$shared/explore';
import type { PageServerLoad } from './$types';

/**
 * Le rapport public du redressement d une enquete.
 *
 * Trois parametres choisissent le comparatif par sous-groupe (`$shared/explore`).
 * Ils sont partageables comme ceux de l explorateur, et suivent la meme regle :
 * on en ajoute, on n en renomme pas (AGENTS.md 1.4).
 *
 * La page n existe que pour un redressement PUBLIE. Un calcul que l equipe n a
 * pas propose au public n a pas a se lire ici, meme en connaissant l adresse.
 */
export const load: PageServerLoad = async ({ params, url }) => {
	const survey = await getPublishedSurvey(params.slug);
	if (!survey) error(404, { message: "Cette enquête n'existe pas ou n'est pas publiée." });

	const weighting = await loadPublishedWeighting(survey.id);
	if (!weighting) {
		error(404, { message: "Aucun redressement n'est publié pour cette enquête." });
	}

	const threshold = await resolveThreshold(survey);
	const [input, weights, questions] = await Promise.all([
		loadWeightingNoteInput(survey.id, { threshold }),
		loadWeights(survey.id),
		loadQuestions(survey)
	]);
	if (!input) error(404, { message: "Aucun redressement n'est publié pour cette enquête." });

	const calibrated = weighting.variables.map((variable) => variable.questionCode);
	const explore = (search: Record<string, string>) =>
		`/donnees/${survey.slug}?${new URLSearchParams({ ...search, [PARAM_READING]: WEIGHTED_READING })}`;

	// Des reponses arrivees apres le calcul n ont pas de poids : les compter a 1
	// a cote de reponses calees melangerait deux populations. La note decrit le
	// calcul, qui a eu lieu ; les comparaisons attendent le prochain.
	const comparisons = weighting.fresh
		? questions
				.filter((question) => !calibrated.includes(question.code))
				.map((question) => compareQuestion(question, weights, threshold))
		: [];

	const selection = resolveSubgroupSelection(
		{
			question: url.searchParams.get(PARAM_REPORT_QUESTION),
			modality: url.searchParams.get(PARAM_REPORT_ANSWER),
			group: url.searchParams.get(PARAM_REPORT_GROUP)
		},
		comparisons,
		questions.map((question) => question.code),
		calibrated
	);

	return {
		survey: {
			slug: survey.slug,
			title: survey.title,
			fieldworkStart: survey.fieldworkStart,
			fieldworkEnd: survey.fieldworkEnd
		},
		threshold,
		fresh: weighting.fresh,
		facts: {
			version: input.version,
			computedAt: input.computedAt,
			respondents: input.respondents,
			effectiveSampleSize: input.metrics.effectiveSampleSize,
			designEffect: input.metrics.designEffect
		},
		note: composeWeightingNote(input),
		marginCharts: Object.fromEntries(
			input.variables.map((variable) => [
				variable.code,
				renderedChart(marginComparisonOption(variable.rows))
			])
		),
		shifts: largestShifts(comparisons),
		comparisons: comparisons.map((comparison) => ({
			...comparison,
			exploreUrl: explore({ [PARAM_X]: comparison.code }),
			chart: renderedChart(impactOption(visible(comparison.rows)))
		})),
		subgroup: selection
			? describeSubgroup(selection, questions, comparisons, weights, threshold, explore)
			: null
	};
};

/** Les questions croisables de l enquete, avec leurs reponses. */
async function loadQuestions(
	survey: NonNullable<Awaited<ReturnType<typeof getPublishedSurvey>>>
): Promise<ReportQuestion[]> {
	return Promise.all(
		crossableQuestions(survey).map(async (question) => ({
			code: question.code,
			label: question.label,
			modalities: questionModalities(question),
			rows: await getAnswerRows(question.id)
		}))
	);
}

/** Ce que les graphiques peuvent dessiner : une case masquee n y entre pas. */
function visible<T extends ComparedShare & { label: string; suppressed: boolean }>(
	rows: readonly T[]
) {
	return rows
		.filter((row) => !row.suppressed)
		.map((row) => ({ label: row.label, raw: row.raw, weighted: row.weighted }));
}

/** Le comparatif par sous-groupe, et de quoi en changer. */
function describeSubgroup(
	selection: NonNullable<ReturnType<typeof resolveSubgroupSelection>>,
	questions: readonly ReportQuestion[],
	comparisons: ReturnType<typeof compareQuestion>[],
	weights: ReadonlyMap<string, number>,
	threshold: number,
	explore: (search: Record<string, string>) => string
) {
	const question = questions.find((candidate) => candidate.code === selection.question)!;
	const group = questions.find((candidate) => candidate.code === selection.group)!;
	const comparison = comparisons.find((candidate) => candidate.code === selection.question)!;
	const result = compareBySubgroup(group, question, selection.modality, weights, threshold);

	return {
		selection,
		questionLabel: question.label,
		groupLabel: group.label,
		questions: comparisons.map(({ code, label }) => ({ code, label })),
		answers: comparison.rows.map(({ key, label }) => ({ key, label })),
		groups: questions
			.filter((candidate) => candidate.code !== question.code)
			.map(({ code, label }) => ({ code, label })),
		overall: comparison.rows.find((row) => row.key === selection.modality) ?? null,
		overallRespondents: comparison.respondents,
		overallEffective: comparison.effectiveRespondents,
		result,
		chart: result ? renderedChart(impactOption(visible(result.rows))) : null,
		// Le meme croisement dans l explorateur : lecture en ligne, « parmi les… ».
		exploreUrl: explore({ [PARAM_X]: group.code, [PARAM_Y]: question.code })
	};
}
