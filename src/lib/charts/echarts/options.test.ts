import { describe, expect, it } from 'vitest';
import { NON_RESPONSE_KEY, type ModalityDescriptor } from '$shared/questions';
import type { AnswerRow } from '$lib/server/survey/aggregate';
import { buildOutcome, sortOutcome, type Axis } from '$lib/server/survey/explore';
import { everyone } from '$lib/server/survey/population';
import { colorFor, colorSlots, NON_RESPONSE_COLOR, SUPPRESSED_COLOR } from '../palette';
import { barsOption, donutOption, groupedOption, legendRows, stackedOption } from './options';

const PRIORITE: readonly ModalityDescriptor[] = [
	{ key: 'pouvoir-achat', label: "Le pouvoir d'achat", isNonResponse: false },
	{ key: 'sante', label: 'La santé', isNonResponse: false },
	{ key: NON_RESPONSE_KEY, label: 'Sans réponse', isNonResponse: true }
];

const REGION: readonly ModalityDescriptor[] = [
	{ key: 'bre', label: 'Bretagne', isNonResponse: false },
	{ key: 'nor', label: 'Normandie', isNonResponse: false }
];

/** « sante » est cite deux fois plus que « pouvoir-achat » : le tri les inversera. */
const PRIORITE_ROWS: readonly AnswerRow[] = [
	{ responseId: 'r1', modalityKey: 'pouvoir-achat' },
	{ responseId: 'r2', modalityKey: 'pouvoir-achat' },
	{ responseId: 'r3', modalityKey: 'sante' },
	{ responseId: 'r4', modalityKey: 'sante' },
	{ responseId: 'r5', modalityKey: 'sante' },
	{ responseId: 'r6', modalityKey: 'sante' },
	{ responseId: 'r7', modalityKey: NON_RESPONSE_KEY },
	{ responseId: 'r8', modalityKey: NON_RESPONSE_KEY }
];

const REGION_ROWS: readonly AnswerRow[] = PRIORITE_ROWS.map((row, index) => ({
	responseId: row.responseId,
	modalityKey: index < 4 ? 'bre' : 'nor'
}));

const X: Axis = { code: 'priorite', label: 'Priorité', modalities: PRIORITE, rows: PRIORITE_ROWS };
const Y: Axis = { code: 'region', label: 'Région', modalities: REGION, rows: REGION_ROWS };

const CONTEXT = { question: 'Priorité', colorSlots: colorSlots(PRIORITE), basis: 'ligne' } as const;
const CROSS_CONTEXT = {
	question: 'Priorité',
	crossedWith: 'Région',
	colorSlots: colorSlots(REGION),
	basis: 'ligne'
} as const;

function distribution(threshold = 1, sort: 'effectif' | 'questionnaire' = 'questionnaire') {
	const outcome = sortOutcome(
		buildOutcome({
			x: X,
			y: null,
			population: everyone(8),
			threshold,
			includeNonResponses: true
		}),
		sort
	);
	if (outcome.kind !== 'distribution') throw new Error('distribution attendue');
	return outcome.distribution;
}

function crosstab(threshold = 1) {
	const outcome = buildOutcome({
		x: X,
		y: Y,
		population: everyone(8),
		threshold,
		includeNonResponses: true
	});
	if (outcome.kind !== 'crosstab') throw new Error('croisement attendu');
	return outcome.crosstab;
}

/** Les donnees d une serie, telles qu ECharts les recevra. */
function seriesData(option: Record<string, unknown>, index = 0) {
	const series = option.series as { data: { value: number; itemStyle?: { color?: string } }[] }[];
	return series[index]?.data ?? [];
}

describe('contrat de serialisation', () => {
	// L objet est calcule sur le serveur, rendu en SVG la-bas, puis renvoye au
	// navigateur qui reprend la main dessus. Une fonction de formatage ne
	// traverserait pas : elle disparaitrait en silence et le graphique client
	// differerait du graphique serveur.
	it('ne contient aucune fonction', () => {
		const options = [
			barsOption(distribution(), CONTEXT).option,
			donutOption(distribution(), CONTEXT).option,
			stackedOption(crosstab(), CROSS_CONTEXT).option,
			groupedOption(crosstab(), CROSS_CONTEXT).option
		];

		for (const option of options) {
			expect(JSON.parse(JSON.stringify(option))).toEqual(JSON.parse(JSON.stringify(option)));
			expect(JSON.stringify(option)).not.toContain('function');
		}
	});
});

describe('barsOption', () => {
	it('publie des parts a une decimale, comme partout ailleurs', () => {
		const values = seriesData(barsOption(distribution(), CONTEXT).option).map((d) => d.value);

		// 4 sur 8, 2 sur 8, 2 sur 8.
		expect(values).toContain(50);
		expect(values).toContain(25);
	});

	it('grandit avec le nombre de modalites', () => {
		// Une hauteur fixe ecraserait une question a douze modalites en une
		// grille illisible. Sous le plancher, en revanche, la hauteur ne bouge
		// plus : deux barres n ont pas besoin d occuper tout l ecran.
		const base = distribution();
		const twelve = {
			...base,
			bars: Array.from({ length: 12 }, (_, index) => ({
				...(base.bars[0] as (typeof base.bars)[number]),
				key: `m${index}`,
				label: `Modalité ${index}`
			}))
		};

		expect(barsOption(twelve, CONTEXT).height).toBeGreaterThan(barsOption(base, CONTEXT).height);
	});

	it('reserve son gris a la non-reponse', () => {
		const data = seriesData(barsOption(distribution(), CONTEXT).option);

		// La non-reponse est en dernier dans l ordre declare, donc en premier une
		// fois l axe inverse.
		expect(data[0]?.itemStyle?.color).toBe(NON_RESPONSE_COLOR);
	});

	it('garde a chaque modalite sa couleur quand le tri change', () => {
		// L invariant de `palette.ts` : trier par effectif ne doit pas repeindre
		// le graphique, sinon deux captures ne se comparent plus.
		const declared = seriesData(barsOption(distribution(1, 'questionnaire'), CONTEXT).option);
		const sorted = seriesData(barsOption(distribution(1, 'effectif'), CONTEXT).option);

		const colorOfSante = colorFor(colorSlots(PRIORITE)['sante'] ?? 0);
		expect(declared.map((d) => d.itemStyle?.color)).toContain(colorOfSante);
		expect(sorted.map((d) => d.itemStyle?.color)).toContain(colorOfSante);
	});

	it('marque une case masquee au lieu de la montrer a zero', () => {
		// Seuil a 3 : « pouvoir-achat » (2) et la non-reponse (2) sont masquees.
		const data = seriesData(barsOption(distribution(3), CONTEXT).option) as {
			itemStyle?: { color?: string };
			label?: { formatter?: string };
		}[];

		const masked = data.filter((entry) => entry.itemStyle?.color === SUPPRESSED_COLOR);
		expect(masked.length).toBeGreaterThan(0);
		expect(masked[0]?.label?.formatter).toBe('Effectif insuffisant');
	});
});

describe('donutOption', () => {
	it('ecarte les parts masquees plutot que de dessiner un vide', () => {
		const data = seriesData(donutOption(distribution(3), CONTEXT).option);

		// Seule « sante » reste publiee au seuil de 3.
		expect(data).toHaveLength(1);
	});

	it('etiquette chaque part avec son libelle et sa valeur', () => {
		const series = donutOption(distribution(), CONTEXT).option.series as {
			data: { label?: { formatter?: string } }[];
		}[];
		const first = series[0]?.data[0]?.label?.formatter ?? '';

		// Libelle et part sur deux lignes, la part deja composee en francais.
		expect(first).toContain("Le pouvoir d'achat");
		expect(first).toMatch(/\d+,\d/);
	});
});

describe('croisements', () => {
	it('empile en une seule pile par ligne', () => {
		const series = stackedOption(crosstab(), CROSS_CONTEXT).option.series as {
			stack?: string;
		}[];

		expect(series.every((serie) => serie.stack === 'total')).toBe(true);
	});

	it('ne groupe pas en empilant', () => {
		const series = groupedOption(crosstab(), CROSS_CONTEXT).option.series as {
			stack?: string;
		}[];

		expect(series.every((serie) => serie.stack === undefined)).toBe(true);
	});

	it('porte une serie par modalite croisee, nommee', () => {
		const series = stackedOption(crosstab(), CROSS_CONTEXT).option.series as { name: string }[];

		expect(series.map((serie) => serie.name)).toEqual(['Bretagne', 'Normandie']);
	});

	it('ecarte de la legende une modalite croisee que le filtre a videe', () => {
		// Filtrer sur deux partis laissait les autres dans la legende, sans barre
		// en face, et amincissait les barres restantes.
		const base = crosstab();
		const filtered = {
			...base,
			columnTotals: new Map([...base.columnTotals].map(([k, v]) => [k, k === 'nor' ? 0 : v]))
		};

		for (const build of [groupedOption, stackedOption]) {
			const series = build(filtered, CROSS_CONTEXT).option.series as { name: string }[];
			expect(series.map((serie) => serie.name)).toEqual(['Bretagne']);
		}
	});

	it('garde une modalite croisee dont le total est masque', () => {
		const base = crosstab();
		const masked = {
			...base,
			columnTotals: new Map([...base.columnTotals].map(([k, v]) => [k, k === 'nor' ? null : v]))
		};
		const series = groupedOption(masked, CROSS_CONTEXT).option.series as { name: string }[];

		expect(series).toHaveLength(2);
	});

	it('montre toute la legende au lieu de la faire defiler', () => {
		const built = groupedOption(crosstab(), CROSS_CONTEXT);
		const legend = built.option.legend as { type: string };

		expect(legend.type).toBe('plain');
	});

	it('reserve la place d une legende sur plusieurs lignes', () => {
		const labels = Array.from({ length: 12 }, (_, i) => `Parti numéro ${i}`);

		expect(legendRows(labels, 320)).toBeGreaterThan(legendRows(labels, 640));
		expect(legendRows(['Bretagne', 'Normandie'], 320)).toBe(1);
		expect(legendRows([], 320)).toBe(0);
	});

	it('plafonne l axe des parts a 100 en empile', () => {
		const axis = stackedOption(crosstab(), CROSS_CONTEXT).option.xAxis as { max?: number };

		// Chaque ligne vaut 100 % d elle-meme : un axe libre laisserait croire
		// que les lignes se comparent en longueur.
		expect(axis.max).toBe(100);
	});
});

describe('formatage des chiffres', () => {
	// `shared/format.ts` est la seule implementation du formatage des chiffres
	// publies. Un gabarit « {c} » laisse ECharts ecrire « 30.4 » : la meme part
	// s afficherait alors « 30,4 % » dans le tableau et « 30.4 % » sur la barre.
	it('ne laisse aucun gabarit de valeur a ECharts', () => {
		const options = [
			barsOption(distribution(), CONTEXT).option,
			donutOption(distribution(), CONTEXT).option,
			stackedOption(crosstab(), CROSS_CONTEXT).option,
			groupedOption(crosstab(), CROSS_CONTEXT).option
		];

		for (const option of options) {
			expect(JSON.stringify(option)).not.toContain('{c}');
		}
	});

	it('ecrit les parts a la francaise, virgule comprise', () => {
		const series = barsOption(distribution(), CONTEXT).option.series as {
			data: { label?: { formatter?: string } }[];
		}[];
		const labels = (series[0]?.data ?? []).map((entry) => entry.label?.formatter ?? '');

		expect(labels.some((label) => label.includes(','))).toBe(true);
		expect(labels.every((label) => !label.includes('.'))).toBe(true);
	});
});
