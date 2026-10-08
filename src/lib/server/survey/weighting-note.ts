import {
	formatCount,
	formatDate,
	formatDecimal,
	formatFieldwork,
	formatPoints,
	formatShare
} from '$lib/shared/format';
import type { WeightingSettings } from './weighting';
import type { MarginRow } from './weighting-plan';

/**
 * La note methodologique du redressement, composee une seule fois.
 *
 * La page du back-office et le PDF remis aux partenaires rendent le MEME
 * document : deux textes ecrits a part finiraient par dire deux choses, et la
 * note est justement la piece qui doit pouvoir etre opposee au chiffre publie.
 * Les nombres sortent deja formates, pour la meme raison.
 */

/** Un morceau de phrase. `sub` sert aux indices de la formule de calage. */
export interface NoteRun {
	readonly text: string;
	readonly style?: 'em' | 'sub';
}

export interface NoteMarginRow {
	readonly key: string;
	readonly label: string;
	readonly observed: string;
	readonly target: string;
	readonly weighted: string;
	readonly deviation: string;
	/** Marge restee a plus d'un point de sa cible : a lire avec cet ecart. */
	readonly far: boolean;
}

export type NoteBlock =
	| { readonly kind: 'paragraph'; readonly runs: readonly NoteRun[] }
	| {
			readonly kind: 'margins';
			readonly label: string;
			readonly provenance: string;
			readonly rows: readonly NoteMarginRow[];
			readonly footnote: string | null;
	  }
	| { readonly kind: 'facts'; readonly rows: readonly { label: string; value: string }[] };

export interface NoteSection {
	readonly title: string;
	readonly blocks: readonly NoteBlock[];
}

export interface WeightingNote {
	readonly version: number;
	readonly eyebrow: string;
	readonly title: string;
	readonly subject: string;
	readonly subtitle: string;
	readonly fileName: string;
	/** En-tetes des tableaux de marges, apres la colonne des modalites. */
	readonly marginColumns: typeof MARGIN_COLUMNS;
	readonly sections: readonly NoteSection[];
}

/** En-tetes des tableaux de marges, dans l'ordre de l'onglet Marges. */
export const MARGIN_COLUMNS = [
	'Échantillon brut',
	'Cible',
	'Échantillon redressé',
	'Écart à la cible'
] as const;

/** Au-dela d'un point d'ecart, la marge est signalee. */
export const FAR_FROM_TARGET = 0.01;

export interface WeightingNoteInput {
	readonly survey: { readonly slug: string; readonly title: string };
	readonly version: number;
	readonly computedAt: Date;
	readonly fieldworkStart: Date | null;
	readonly fieldworkEnd: Date | null;
	readonly source: string | null;
	readonly respondents: number;
	readonly settings: WeightingSettings | null;
	readonly convergence: {
		readonly converged: boolean;
		readonly iterations: number;
		readonly maxDeviation: number;
	};
	readonly metrics: {
		readonly effectiveSampleSize: number;
		readonly designEffect: number;
		readonly coefficientOfVariation: number;
		readonly minWeight: number;
		readonly maxWeight: number;
		readonly weightRatio: number | null;
		readonly atBounds: number;
	};
	readonly alertThreshold: number;
	readonly pcsTable: string | null;
	readonly variables: readonly {
		readonly code: string;
		readonly label: string;
		readonly origin: { readonly period: string; readonly edited: boolean } | null;
		readonly missing: number;
		readonly rows: readonly MarginRow[];
	}[];
}

const text = (value: string): NoteRun => ({ text: value });
const paragraph = (...runs: NoteRun[]): NoteBlock => ({ kind: 'paragraph', runs });

function plural(count: number, word: string): string {
	return count > 1 ? `${word}s` : word;
}

function dataSection(input: WeightingNoteInput): NoteSection {
	const fieldwork = formatFieldwork(input.fieldworkStart, input.fieldworkEnd);
	return {
		title: '1. Données',
		blocks: [
			paragraph(
				text(
					`L'échantillon compte ${formatCount(input.respondents)} répondants, dont les réponses ont été ` +
						"recueillies par le questionnaire de l'association sur forms.humanitour.fr." +
						(fieldwork ? ` ${fieldwork}.` : '') +
						" L'échantillon n'est pas issu d'un tirage aléatoire : les poids initiaux sont donc tous " +
						"égaux à 1, et le redressement ne s'appuie sur aucun poids de sondage."
				)
			)
		]
	};
}

function stoppingRule(settings: WeightingSettings): NoteBlock {
	const trim = settings.trim
		? ` Les poids ont été tronqués à chaque itération dans l'intervalle [${formatDecimal(settings.minWeight, 4)} ; ` +
			`${formatDecimal(settings.maxWeight, 4)}], puis renormalisés. Il s'agit d'un raking tronqué, distinct de ` +
			'la méthode logit bornée de CALMAR : il peut laisser un écart résiduel aux cibles, chiffré ci-dessous.'
		: " Aucune troncature n'a été appliquée aux poids.";
	return paragraph(
		text(
			"Critère d'arrêt : écart maximal entre une marge obtenue et sa cible inférieur à ε = " +
				`${formatDecimal(settings.tolerance, 8)} (en part), dans la limite de ${settings.maxIterations} ` +
				`itérations.${trim}`
		)
	);
}

function convergence(input: WeightingNoteInput): NoteBlock {
	const { converged, iterations, maxDeviation } = input.convergence;
	if (converged) {
		return paragraph(
			text(
				`Le calage a convergé en ${iterations} ${plural(iterations, 'itération')} ; l'écart maximal ` +
					`restant est de ${formatDecimal(maxDeviation * 100, 4)} point de pourcentage.`
			)
		);
	}
	return paragraph(
		text(
			`Le calage n'a pas convergé en ${iterations} itérations : l'écart maximal restant est de ` +
				`${formatDecimal(maxDeviation * 100, 3)} point de pourcentage. Les marges redressées ci-dessous ` +
				'doivent être lues avec cet écart.'
		)
	);
}

function methodSection(input: WeightingNoteInput): NoteSection {
	const formula = paragraph(
		text(
			'Les poids sont obtenus par calage sur marges, selon la méthode de Deville et Särndal (1992), avec ' +
				"la fonction de distance raking ratio (exponentielle). Le calcul emploie l'algorithme de calage " +
				'itératif proportionnel (Deming et Stephan, 1940) : à chaque itération, les poids sont ajustés ' +
				'variable par variable pour que, pour chaque modalité '
		),
		{ text: 'j', style: 'em' },
		text(', la somme des poids des répondants de la modalité rejoigne le total marginal visé, Σ'),
		{ text: 'k', style: 'sub' },
		text(' w'),
		{ text: 'k', style: 'sub' },
		text(' x'),
		{ text: 'kj', style: 'sub' },
		text(' = T'),
		{ text: 'j', style: 'sub' },
		text(
			". Sans bornes et à convergence, cette procédure donne l'estimateur par calage de la méthode " +
				"raking ratio de la macro CALMAR de l'Insee. Les poids sont strictement positifs, puis ramenés à " +
				"une moyenne de 1 : leur somme égale l'effectif de l'échantillon."
		)
	);
	return {
		title: '2. Méthode',
		blocks: [formula, ...(input.settings ? [stoppingRule(input.settings)] : []), convergence(input)]
	};
}

function provenance(origin: WeightingNoteInput['variables'][number]['origin']): string {
	if (!origin) return 'cibles saisies à la main';
	const edited = origin.edited ? ', cibles retouchées à la main' : '';
	return `recensement de la population ${origin.period}${edited}`;
}

function marginRow(row: MarginRow): NoteMarginRow {
	const gap = row.weighted === null || row.target === null ? null : row.weighted - row.target;
	return {
		key: row.key,
		label: row.label,
		observed: formatShare(row.observed),
		target: formatShare(row.target),
		weighted: formatShare(row.weighted),
		deviation: gap === null ? '' : formatPoints(gap),
		far: gap !== null && Math.abs(gap) > FAR_FROM_TARGET
	};
}

function missingFootnote(missing: number): string | null {
	if (missing === 0) return null;
	return (
		`${formatCount(missing)} ${plural(missing, 'répondant')} sans réponse à cette question, ` +
		`${plural(missing, 'conservé')} avec un poids inchangé sur cette variable ; les parts ci-dessus sont ` +
		'calculées sur les répondants classés.'
	);
}

function marginsSection(input: WeightingNoteInput): NoteSection {
	const pcs = input.pcsTable
		? [
				paragraph(
					text(
						`Pour le groupe socioprofessionnel, le tableau ${input.pcsTable} du recensement ne descend ` +
							'pas sous la tranche des 15-19 ans : la part des 18-19 ans y a été estimée en supposant ' +
							'la répartition par groupe identique à tous les âges de cette tranche.'
					)
				)
			]
		: [];
	return {
		title: '3. Totaux marginaux de référence',
		blocks: [
			paragraph(text(`Source des marges : ${input.source ?? 'non renseignée.'}`)),
			...pcs,
			...input.variables.map((variable): NoteBlock => ({
				kind: 'margins',
				label: variable.label,
				provenance: provenance(variable.origin),
				rows: variable.rows.map(marginRow),
				footnote: missingFootnote(variable.missing)
			}))
		]
	};
}

function qualitySection(input: WeightingNoteInput): NoteSection {
	const { metrics } = input;
	const effective = formatCount(Math.round(metrics.effectiveSampleSize));
	const alert =
		metrics.designEffect > input.alertThreshold
			? ` Il dépasse ${formatDecimal(input.alertThreshold, 1)}, seuil au-delà duquel la perte de précision ` +
				'est jugée importante : les écarts entre sous-groupes doivent être interprétés avec prudence.'
			: '';
	const bounds = input.settings?.trim
		? [{ label: 'Répondants à une borne', value: formatCount(metrics.atBounds) }]
		: [];
	return {
		title: '4. Qualité du redressement',
		blocks: [
			{
				kind: 'facts',
				rows: [
					{
						label: 'Taille effective (Kish)',
						value: `${effective} sur ${formatCount(input.respondents)}`
					},
					{
						label: 'Effet de plan, Deff = 1 + CV(w)²',
						value: formatDecimal(metrics.designEffect, 3)
					},
					{
						label: 'Coefficient de variation des poids',
						value: formatDecimal(metrics.coefficientOfVariation, 3)
					},
					{
						label: 'Poids minimal et maximal',
						value: `${formatDecimal(metrics.minWeight, 3)} et ${formatDecimal(metrics.maxWeight, 3)}`
					},
					{ label: 'Rapport w max / w min', value: formatDecimal(metrics.weightRatio, 1) },
					...bounds
				]
			},
			paragraph(
				text(
					"L'effet de plan mesure la perte de précision due à la dispersion des poids : une estimation " +
						`redressée a la précision d'un échantillon non pondéré de ${effective} personnes.${alert}`
				)
			)
		]
	};
}

const LIMITS: NoteSection = {
	title: '5. Limites',
	blocks: [
		paragraph(
			text(
				"Le calage corrige la structure de l'échantillon sur les seules variables de calage. Il ne corrige " +
					'pas un biais de sélection sur des caractéristiques non observées : si les personnes rencontrées ' +
					'diffèrent de la population par leur intérêt pour la politique, à sexe, âge et territoire égaux, ' +
					"les poids n'en tiennent pas compte. Il ne crée pas non plus d'information sur une catégorie " +
					"absente de l'échantillon."
			)
		),
		paragraph(
			text(
				'Les résultats bruts restent publiés et constituent la lecture de référence. Le poids de chaque ' +
					'répondant est conservé et exportable, et chaque version du redressement est consignée, avec ses ' +
					'marges et ses paramètres, au journal de la plateforme.'
			)
		)
	]
};

export function composeWeightingNote(input: WeightingNoteInput): WeightingNote {
	return {
		version: input.version,
		eyebrow: 'Humanitour, institut de sondage citoyen · Note méthodologique',
		title: 'Redressement',
		subject: input.survey.title,
		subtitle: `Version ${input.version} du redressement, calculée le ${formatDate(input.computedAt)}.`,
		fileName: `redressement-${input.survey.slug}-v${input.version}.pdf`,
		marginColumns: MARGIN_COLUMNS,
		sections: [
			dataSection(input),
			methodSection(input),
			marginsSection(input),
			qualitySection(input),
			LIMITS
		]
	};
}
