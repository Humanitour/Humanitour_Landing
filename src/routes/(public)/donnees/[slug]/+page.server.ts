import { error } from '@sveltejs/kit';
import {
	buildChart,
	chartsForSelection,
	colorSlots,
	resolveChart,
	wantsTimeline
} from '$charts';
import { exploreSearch, parseExploreParams } from '$shared/explore';
import { codeExamples, longCitation, shortCitation } from '$shared/citation';
import { getQuestionType } from '$shared/questions';
import { formatFieldwork } from '$shared/format';
import {
	baseOf,
	buildFilterGroups,
	buildOutcome,
	buildPanels,
	describeDropped,
	describeUnavailableWeighting,
	resolveSort,
	shapeOf,
	sortOutcome
} from '$lib/server/survey/explore';
import { renderChartSvg } from '$lib/server/charts';
import { describeWeighting } from '$lib/server/survey/weighting-plan';
import { insightsOf } from '$lib/server/survey/insights';
import { buildTimeline, type TimelineResult } from '$lib/server/survey/timeline';
import {
	filterableQuestions,
	getPublishedSurvey,
	loadCollectionDates,
	prepareExplore,
	publishedSelection
} from '$lib/server/survey/queries';
import type { CellBasis } from '$charts/crosstab-cell';
import type { Axis } from '$lib/server/survey/explore';
import type { PageServerLoad } from './$types';

/**
 * Page publique d un sondage, et explorateur de croisements.
 *
 * Les parametres `x`, `y`, `chart`, `nr`, `tri` et `filtre` forment un
 * PERMALIEN : un croisement partage par un journaliste doit continuer de
 * fonctionner dans quatre ans. Leur lecture vit dans `$shared/explore`, la meme
 * que celle de l API publique, et on peut en ajouter mais jamais en renommer
 * (AGENTS.md section 1.4).
 *
 * Le calcul vit dans `prepareExplore` et `buildOutcome`, partages avec
 * `/api/public/sondages/[slug]/resultat`. La page et l API ne peuvent donc pas
 * publier deux chiffres differents pour la meme question.
 */
export const load: PageServerLoad = async ({ params, url }) => {
	const survey = await getPublishedSurvey(params.slug);
	if (!survey) error(404, { message: "Cette enquete n'existe pas ou n'est pas publiee." });

	const requested = parseExploreParams(url.searchParams);
	const prepared = await prepareExplore(survey, requested);
	if (!prepared) error(500, { message: 'Cette enquete ne comporte aucune question exploitable.' });

	const { selection, timelineMode, chart } = resolveView(requested.chart, prepared);

	// Le tri depend du TYPE de la question portee en abscisse : une echelle
	// garde son ordre, une liste de choix se classe par effectif.
	// La lecture en ligne est celle qu on attend d un tri croise : « parmi les
	// Bretons, X % citent… ». Les trois autres sont a un clic.
	const basis = requested.basis ?? 'ligne';

	const sort = resolveSort(
		requested.sort,
		getQuestionType(prepared.xQuestion.type)?.ordered ?? false
	);

	const inputs = {
		x: prepared.x,
		y: prepared.y,
		population: prepared.population,
		threshold: prepared.threshold,
		includeNonResponses: requested.includeNonResponses,
		weights: prepared.weights
	};

	const outcome = sortOutcome(buildOutcome(inputs), sort);

	/*
	 * Le decoupage en petits multiples.
	 *
	 * Chaque panneau est un resultat complet, protege separement par le seuil :
	 * croiser trois variables divise l echantillon, et c est exactement la ou
	 * une combinaison finit par ne designer qu une personne.
	 */
	const panels = paintPanels({ chart, inputs, prepared, sort, basis });

	// Les memes questions servent les deux axes et le panneau de filtres : une
	// variable socio-demographique n est pas une categorie a part, c est une
	// question comme les autres (CLAUDE.md, modele de donnees).
	const filterable = filterableQuestions(survey);
	const base = baseOf(outcome);

	const { timeline, built } = await paintMain({
		timelineMode,
		chart,
		outcome,
		inputs,
		prepared,
		basis,
		surveyId: survey.id
	});

	const share = buildShare({ survey, requested, prepared, filterable, base, origin: url.origin });

	return {
		survey: {
			slug: survey.slug,
			title: survey.title,
			subtitle: survey.subtitle,
			description: survey.description,
			methodology: survey.methodology,
			fieldworkStart: survey.fieldworkStart,
			fieldworkEnd: survey.fieldworkEnd,
			responseCount: survey.responseCount,
			keywords: survey.keywords,
			geographicCoverage: survey.geographicCoverage,
			collectionMode: survey.collectionMode,
			updateFrequency: survey.updateFrequency,
			// Le referencement se rabat sur ce qui est deja ecrit pour etre lu :
			// une description de partage vide vaut mieux qu une description
			// fabriquee, mais un sous-titre existant vaut mieux que rien.
			metaTitle: survey.metaTitle ?? survey.title,
			metaDescription: survey.metaDescription ?? survey.subtitle ?? survey.description
		},
		questions: filterable.map(({ code, label }) => ({ code, label })),
		filterGroups: buildFilterGroups(filterable, requested.filters),
		selection: describeSelection(prepared, chart.key, requested),
		charts: chartsForSelection(selection).map(({ key, label, description }) => ({
			key,
			label,
			description
		})),
		chart: built
			? { key: chart.key, option: built.option, height: built.height, svg: renderChartSvg(built) }
			: null,
		chartIsTabular: chart.tabular,
		threshold: prepared.threshold,
		population: {
			// Sous le seuil, l effectif de la sous-population est lui-meme un
			// agregat identifiant : il ne descend pas jusqu a la page.
			size: outcome.kind === 'too-small' ? null : prepared.population.size,
			total: prepared.population.total,
			restricted: prepared.population.restricted
		},
		outcome,
		timeline,
		panels,
		// Un constat porte sur UN resultat. Decoupe en panneaux, la page en
		// afficherait un par panneau, ce qui noierait ce qu ils servent a dire.
		insights: panels ? [] : insightsOf(outcome),
		appliedSort: sort,
		appliedBasis: basis,
		droppedMessage: describeDropped(prepared.dropped),
		reading: describeReading(prepared, filterable),
		// Les croisements que l equipe met en avant : des permaliens, pas des
		// chiffres. Celui qu on ouvre est calcule par l explorateur, comme les autres.
		teamSelection: await publishedSelection(survey),
		share
	};
};

/** La lecture servie, brute ou redressee, et de quoi proposer l autre. */
function describeReading(
	prepared: Awaited<ReturnType<typeof prepareExplore>> & object,
	filterable: ReturnType<typeof filterableQuestions>
) {
	return {
		weighted: prepared.weights !== null,
		// La bascule ne s affiche que si la lecture redressee peut etre servie.
		available: prepared.weighting?.fresh === true,
		unavailableMessage: describeUnavailableWeighting(prepared),
		weighting: prepared.weighting ? describeWeighting(prepared.weighting, filterable) : null
	};
}

/** Ce qui est affiche, sous la forme que la page relit pour ecrire ses liens. */
function describeSelection(
	prepared: { x: Axis; y: Axis | null; z: Axis | null },
	chartKey: string,
	requested: ReturnType<typeof parseExploreParams>
) {
	return {
		x: prepared.x.code,
		xLabel: prepared.x.label,
		y: prepared.y?.code ?? null,
		yLabel: prepared.y?.label ?? null,
		z: prepared.z?.code ?? null,
		zLabel: prepared.z?.label ?? null,
		chart: chartKey,
		includeNonResponses: requested.includeNonResponses,
		filters: requested.filters,
		sort: requested.sort,
		basis: requested.basis,
		weighted: requested.weighted
	};
}

/**
 * Les petits multiples, chacun avec son propre graphique rendu.
 *
 * Extrait du chargement, qui faisait deja trop de choses. Chaque panneau est un
 * resultat complet : il est trie comme les autres, dessine comme les autres, et
 * protege separement par le seuil d anonymat.
 */
function paintPanels(input: {
	chart: ReturnType<typeof resolveChart>;
	inputs: Parameters<typeof buildPanels>[0];
	prepared: { z: Parameters<typeof buildPanels>[1] | null } & Parameters<typeof paintChart>[2];
	sort: Parameters<typeof sortOutcome>[1];
	basis: CellBasis;
}) {
	const { chart, inputs, prepared, sort } = input;
	if (!prepared.z) return null;

	return buildPanels(inputs, prepared.z).map((panel) => {
		const sorted = sortOutcome(panel.outcome, sort);
		const built = paintChart(chart, sorted, prepared, input.basis);

		return {
			key: panel.key,
			label: panel.label,
			isNonResponse: panel.isNonResponse,
			size: panel.size,
			outcome: sorted,
			chart: built
				? { key: chart.key, option: built.option, height: built.height, svg: renderChartSvg(built) }
				: null
		};
	});
}

/**
 * Construit le graphique, ou rien s il n y a rien a dessiner.
 *
 * Les couleurs sont figees sur l ordre DECLARE des modalites, et non sur leur
 * position a l ecran : trier par effectif ou masquer la non-reponse ne doit pas
 * repeindre le graphique, sinon deux captures de la meme enquete ne se
 * comparent plus (`charts/palette.ts`). Les series portent les modalites
 * croisees quand il y en a, celles de la question sinon.
 */
function paintChart(
	chart: ReturnType<typeof resolveChart>,
	outcome: ReturnType<typeof buildOutcome>,
	prepared: {
		x: { label: string; modalities: readonly { key: string }[] };
		y: { label: string; modalities: readonly { key: string }[] } | null;
	},
	basis: CellBasis
) {
	if (outcome.kind === 'too-small') return null;

	const painted = prepared.y ?? prepared.x;

	return buildChart(chart, outcome.kind === 'crosstab' ? outcome.crosstab : outcome.distribution, {
		question: prepared.x.label,
		crossedWith: prepared.y?.label,
		colorSlots: colorSlots(painted.modalities),
		basis
	});
}

/**
 * La visualisation a servir, et si c est l evolution qui est demandee.
 *
 * L evolution n est proposee que sur une question seule : ni second axe, ni
 * decoupage (`charts/index.ts`, `chartsForSelection`).
 */
function resolveView(requestedChart: string, prepared: { y: Axis | null; z: Axis | null }) {
	const selection = { crossed: prepared.y !== null, split: prepared.z !== null };
	const timelineMode = wantsTimeline(requestedChart, selection);
	const shape = timelineMode ? 'timeline' : shapeOf({ y: prepared.y });

	return { selection, timelineMode, chart: resolveChart(requestedChart, shape) };
}

/**
 * Le graphique principal, et l evolution quand elle est demandee.
 *
 * L evolution est calculee A COTE du resultat d ensemble, pas a sa place : la
 * base citee, les constats et la citation continuent de porter sur toute la
 * periode, et la courbe montre comment on y est arrive. Sous le seuil pour
 * l ensemble, aucune semaine ne pourrait le passer : on ne calcule rien.
 */
async function paintMain(input: {
	timelineMode: boolean;
	chart: ReturnType<typeof resolveChart>;
	outcome: ReturnType<typeof buildOutcome>;
	inputs: Parameters<typeof buildOutcome>[0];
	prepared: Parameters<typeof paintChart>[2];
	basis: CellBasis;
	surveyId: string;
}) {
	const { chart, outcome, prepared } = input;

	if (!input.timelineMode || outcome.kind === 'too-small') {
		return { timeline: null, built: paintChart(chart, outcome, prepared, input.basis) };
	}

	const timeline = buildTimeline(input.inputs, await loadCollectionDates(input.surveyId));
	return { timeline, built: paintTimeline(chart, timeline, prepared) };
}

/**
 * La courbe d evolution.
 *
 * Memes emplacements de couleur que la repartition de la meme question : passer
 * des barres a la courbe ne doit pas repeindre les modalites, sinon le lecteur
 * perd la correspondance d un affichage a l autre (`charts/palette.ts`).
 */
function paintTimeline(
	chart: ReturnType<typeof resolveChart>,
	timeline: TimelineResult,
	prepared: { x: { label: string; modalities: readonly { key: string }[] } }
) {
	return buildChart(chart, timeline, {
		question: prepared.x.label,
		colorSlots: colorSlots(prepared.x.modalities),
		basis: 'ligne'
	});
}

/**
 * De quoi citer, telecharger et rejouer le resultat affiche.
 *
 * Extrait du chargement parce que celui-ci faisait deux choses : calculer un
 * resultat, et fabriquer les adresses qui l accompagnent. Les adresses sont
 * absolues et deduites de la REQUETE plutot que d une variable
 * d environnement : une citation ne doit pas pouvoir pointer ailleurs que la
 * ou se trouve le lecteur qui la copie.
 */
function buildShare(input: {
	survey: { slug: string; title: string; fieldworkStart: Date | null; fieldworkEnd: Date | null };
	requested: ReturnType<typeof parseExploreParams>;
	prepared: { x: { label: string }; y: { label: string } | null };
	filterable: ReturnType<typeof filterableQuestions>;
	base: number | null;
	origin: string;
}) {
	const { survey, requested, prepared, filterable, base, origin } = input;
	const search = exploreSearch(requested);
	const query = search ? `?${search}` : '';

	const pageUrl = `${origin}/donnees/${survey.slug}${query}`;
	const apiUrl = `${origin}/api/public/sondages/${survey.slug}/resultat${query}`;

	const context = {
		surveyTitle: survey.title,
		questionLabel: prepared.x.label,
		crossedWithLabel: prepared.y?.label ?? null,
		base,
		filters: describeFilters(filterable, requested.filters),
		fieldwork: formatFieldwork(survey.fieldworkStart, survey.fieldworkEnd),
		pageUrl,
		apiUrl,
		consultedOn: new Date()
	};

	return {
		pageUrl,
		apiUrl,
		csvUrl: `/donnees/${survey.slug}/croisement.csv${query}`,
		shortCitation: shortCitation(context),
		longCitation: longCitation(context),
		codeExamples: codeExamples(apiUrl)
	};
}

/**
 * Les filtres actifs, en libelles lisibles.
 *
 * La citation doit dire sur QUI porte le chiffre. « region:bre » ne le dit pas,
 * « Votre region : Bretagne » le dit.
 */
function describeFilters(
	questions: ReturnType<typeof filterableQuestions>,
	filters: ReturnType<typeof parseExploreParams>['filters']
): readonly string[] {
	return filters.flatMap((clause) => {
		const question = questions.find((candidate) => candidate.code === clause.questionCode);
		if (!question) return [];

		const labels = clause.modalityKeys.map(
			(key) => question.modalities.find((modality) => modality.key === key)?.label ?? key
		);

		return [`${question.label} : ${labels.join(' ou ')}`];
	});
}
