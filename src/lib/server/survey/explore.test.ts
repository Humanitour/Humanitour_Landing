import { describe, expect, it } from 'vitest';
import { NON_RESPONSE_KEY, type ModalityDescriptor } from '$shared/questions';
import type { AnswerRow } from './aggregate';
import {
	blocsOf,
	groupAxis,
	baseOf,
	buildFilterGroups,
	buildOutcome,
	buildPanels,
	describeDropped,
	outcomeToJson,
	resolveSort,
	selectAxes,
	shapeOf,
	sortOutcome,
	suppressedCount,
	type Axis
} from './explore';
import { everyone, restrictTo } from './population';

const PRIORITE: readonly ModalityDescriptor[] = [
	{ key: 'pouvoir-achat', label: "Le pouvoir d'achat", isNonResponse: false },
	{ key: 'sante', label: 'La santé', isNonResponse: false },
	{ key: NON_RESPONSE_KEY, label: 'Sans réponse', isNonResponse: true }
];

const REGION: readonly ModalityDescriptor[] = [
	{ key: 'bre', label: 'Bretagne', isNonResponse: false },
	{ key: 'nor', label: 'Normandie', isNonResponse: false }
];

/** Six repondants : trois bretons, trois normands, une non-reponse chez chacun. */
const PRIORITE_ROWS: readonly AnswerRow[] = [
	{ responseId: 'r1', modalityKey: 'pouvoir-achat' },
	{ responseId: 'r2', modalityKey: 'pouvoir-achat' },
	{ responseId: 'r3', modalityKey: NON_RESPONSE_KEY },
	{ responseId: 'r4', modalityKey: 'sante' },
	{ responseId: 'r5', modalityKey: 'sante' },
	{ responseId: 'r6', modalityKey: NON_RESPONSE_KEY }
];

const REGION_ROWS: readonly AnswerRow[] = [
	{ responseId: 'r1', modalityKey: 'bre' },
	{ responseId: 'r2', modalityKey: 'bre' },
	{ responseId: 'r3', modalityKey: 'bre' },
	{ responseId: 'r4', modalityKey: 'nor' },
	{ responseId: 'r5', modalityKey: 'nor' },
	{ responseId: 'r6', modalityKey: 'nor' }
];

const X: Axis = {
	code: 'priorite',
	label: 'Quel sujet vous tient le plus à cœur ?',
	modalities: PRIORITE,
	rows: PRIORITE_ROWS
};

const Y: Axis = {
	code: 'region',
	label: 'Votre région',
	modalities: REGION,
	rows: REGION_ROWS
};

const BRETONS = restrictTo(6, [new Set(['r1', 'r2', 'r3'])]);

function distributionOf(overrides: Partial<Parameters<typeof buildOutcome>[0]> = {}) {
	return buildOutcome({
		x: X,
		y: null,
		population: everyone(6),
		threshold: 1,
		includeNonResponses: true,
		...overrides
	});
}

describe('shapeOf', () => {
	it('bascule en croisement des qu un second axe est demande', () => {
		expect(shapeOf({ y: null })).toBe('distribution');
		expect(shapeOf({ y: Y })).toBe('crosstab');
	});
});

describe('buildOutcome, sans filtre', () => {
	it('compte la distribution sur toute l enquete', () => {
		const outcome = distributionOf();

		expect(outcome.kind).toBe('distribution');
		expect(baseOf(outcome)).toBe(6);
	});

	it('compte la non-reponse comme une modalite ordinaire', () => {
		const outcome = distributionOf();
		if (outcome.kind !== 'distribution') throw new Error('distribution attendue');

		const nonResponse = outcome.distribution.bars.find((bar) => bar.isNonResponse);
		expect(nonResponse?.count).toBe(2);
	});

	it('retire la non-reponse de l affichage et de la base', () => {
		const outcome = distributionOf({ includeNonResponses: false });
		if (outcome.kind !== 'distribution') throw new Error('distribution attendue');

		expect(outcome.distribution.bars.some((bar) => bar.isNonResponse)).toBe(false);
		const total = outcome.distribution.bars.reduce((acc, bar) => acc + (bar.share ?? 0), 0);
		expect(total).toBeCloseTo(1);
	});

	it('croise deux questions', () => {
		const outcome = buildOutcome({
			x: X,
			y: Y,
			population: everyone(6),
			threshold: 1,
			includeNonResponses: true
		});

		expect(outcome.kind).toBe('crosstab');
		expect(baseOf(outcome)).toBe(6);
	});
});

describe('buildOutcome, avec filtre', () => {
	it('ne compte que la sous-population', () => {
		const outcome = distributionOf({ population: BRETONS });
		if (outcome.kind !== 'distribution') throw new Error('distribution attendue');

		expect(outcome.distribution.respondents).toBe(3);
		const pouvoirAchat = outcome.distribution.bars.find((bar) => bar.key === 'pouvoir-achat');
		expect(pouvoirAchat?.count).toBe(2);
	});

	it('restreint aussi le second axe d un croisement', () => {
		const outcome = buildOutcome({
			x: X,
			y: Y,
			population: BRETONS,
			threshold: 1,
			includeNonResponses: true
		});
		if (outcome.kind !== 'crosstab') throw new Error('croisement attendu');

		// Aucun Normand ne doit subsister dans les effectifs de la Bretagne.
		expect(outcome.crosstab.columnTotals.get('nor') ?? 0).toBe(0);
		expect(outcome.crosstab.respondents).toBe(3);
	});
});

describe('garde-fou de population', () => {
	it('ne publie rien quand la population passe sous le seuil', () => {
		const outcome = distributionOf({ population: BRETONS, threshold: 5 });

		expect(outcome.kind).toBe('too-small');
	});

	it('ne laisse fuir ni effectif ni modalite', () => {
		const outcome = distributionOf({ population: BRETONS, threshold: 5 });

		expect(baseOf(outcome)).toBeNull();
		expect(suppressedCount(outcome)).toBe(0);
		expect(outcomeToJson(outcome)).toEqual({ forme: 'effectif-insuffisant', cellules: [] });
	});

	it('s applique avant le croisement, pas apres', () => {
		const outcome = buildOutcome({
			x: X,
			y: Y,
			population: BRETONS,
			threshold: 5,
			includeNonResponses: true
		});

		expect(outcome.kind).toBe('too-small');
	});

	it('vaut pour l enquete entiere, pas seulement pour les filtres', () => {
		expect(distributionOf({ population: everyone(3), threshold: 5 }).kind).toBe('too-small');
	});

	it('laisse passer une population exactement au seuil', () => {
		expect(distributionOf({ population: everyone(6), threshold: 6 }).kind).toBe('distribution');
	});
});

describe('suppressedCount', () => {
	it('remonte les cases masquees d une distribution', () => {
		const outcome = distributionOf({ threshold: 3 });

		// Chaque modalite pese 2 repondants : toutes passent sous un seuil de 3.
		expect(suppressedCount(outcome)).toBeGreaterThan(0);
	});

	it('remonte les cases masquees d un croisement', () => {
		const outcome = buildOutcome({
			x: X,
			y: Y,
			population: everyone(6),
			threshold: 3,
			includeNonResponses: true
		});

		expect(suppressedCount(outcome)).toBeGreaterThan(0);
	});
});

describe('buildFilterGroups', () => {
	const questions = [
		{ code: 'priorite', label: 'Votre priorité', modalities: PRIORITE },
		{ code: 'region', label: 'Votre région', modalities: REGION }
	];

	it('marque les modalites retenues', () => {
		const groups = buildFilterGroups(questions, [
			{ questionCode: 'region', modalityKeys: ['bre'] }
		]);

		const region = groups.find((group) => group.questionCode === 'region');
		expect(region?.options.find((option) => option.key === 'bre')?.selected).toBe(true);
		expect(region?.options.find((option) => option.key === 'nor')?.selected).toBe(false);
		expect(region?.selectedCount).toBe(1);
	});

	it('laisse les autres questions intactes', () => {
		const groups = buildFilterGroups(questions, [
			{ questionCode: 'region', modalityKeys: ['bre'] }
		]);

		expect(groups.find((group) => group.questionCode === 'priorite')?.selectedCount).toBe(0);
	});

	it('propose la non-reponse au filtrage comme les autres modalites', () => {
		const groups = buildFilterGroups(questions, []);
		const priorite = groups.find((group) => group.questionCode === 'priorite');

		expect(priorite?.options.some((option) => option.isNonResponse)).toBe(true);
	});

	it('ignore une clause visant une question absente du panneau', () => {
		const groups = buildFilterGroups(questions, [{ questionCode: 'csp', modalityKeys: ['cadre'] }]);

		expect(groups.every((group) => group.selectedCount === 0)).toBe(true);
	});
});

describe('outcomeToJson', () => {
	it('sort une distribution en tableau de cellules', () => {
		const json = outcomeToJson(distributionOf());

		expect(json.forme).toBe('distribution');
		expect(json.repondants).toBe(6);
		expect(Array.isArray(json.cellules)).toBe(true);
	});

	it('aplatit les Map du croisement, que JSON ne sait pas transporter', () => {
		const outcome = buildOutcome({
			x: X,
			y: Y,
			population: everyone(6),
			threshold: 1,
			includeNonResponses: true
		});
		const json = outcomeToJson(outcome);

		expect(json.forme).toBe('croisement');
		expect(JSON.parse(JSON.stringify(json))).toEqual(json);
	});

	it('conserve le masquage dans la sortie publique', () => {
		const outcome = distributionOf({ threshold: 3 });
		const json = outcomeToJson(outcome) as { cellules: { masque: boolean; effectif: null }[] };

		const masquee = json.cellules.find((cell) => cell.masque);
		expect(masquee?.effectif).toBeNull();
	});
});

describe('describeDropped', () => {
	it('ne dit rien quand tous les filtres ont ete appliques', () => {
		expect(describeDropped([])).toBeNull();
	});

	it('avertit que le resultat porte sur une population plus large', () => {
		const message = describeDropped([
			{ questionCode: 'csp', reason: 'cette question n existe plus' }
		]);

		expect(message).toContain('csp');
		expect(message).toContain('plus large');
	});

	it('regroupe plusieurs filtres tombes', () => {
		const message = describeDropped([
			{ questionCode: 'csp', reason: 'absente' },
			{ questionCode: 'diplome', reason: 'absente' }
		]);

		expect(message).toContain('csp');
		expect(message).toContain('diplome');
	});
});

describe('selectAxes', () => {
	const crossable = [{ code: 'priorite' }, { code: 'region' }, { code: 'age' }];

	it('retient les deux questions demandees', () => {
		expect(selectAxes(crossable, { x: 'region', y: 'age' })).toEqual({
			x: { code: 'region' },
			y: { code: 'age' },
			z: null
		});
	});

	it('retombe sur la premiere question quand aucune n est demandee', () => {
		expect(selectAxes(crossable, { x: null, y: null }).x).toEqual({ code: 'priorite' });
	});

	it('survit a un lien dont la question a ete supprimee', () => {
		const { x, y } = selectAxes(crossable, { x: 'disparue', y: 'aussi-disparue' });

		expect(x).toEqual({ code: 'priorite' });
		expect(y).toBeNull();
	});

	it('ignore un croisement d une question avec elle-meme', () => {
		expect(selectAxes(crossable, { x: 'region', y: 'region' }).y).toBeNull();
	});

	it('ne retient pas une question non croisable passee dans l adresse', () => {
		// « commentaire » est en texte libre : absente de la liste croisable, elle
		// ne doit pas pouvoir devenir un axe par un parametre d URL.
		expect(selectAxes(crossable, { x: 'commentaire', y: null }).x).toEqual({ code: 'priorite' });
	});

	it('rend des axes vides sur une enquete sans question croisable', () => {
		expect(selectAxes([], { x: 'priorite', y: 'region' })).toEqual({
			x: null,
			y: null,
			z: null
		});
	});
});

describe('resolveSort', () => {
	it('classe par effectif une question sans ordre propre', () => {
		expect(resolveSort(null, false)).toBe('effectif');
	});

	it('garde l ordre du questionnaire pour une echelle', () => {
		expect(resolveSort(null, true)).toBe('questionnaire');
	});

	it('obeit au visiteur quand il a tranche', () => {
		expect(resolveSort('effectif', true)).toBe('effectif');
		expect(resolveSort('questionnaire', false)).toBe('questionnaire');
	});
});

describe('sortOutcome', () => {
	it('classe les modalites de la plus citee a la moins citee', () => {
		const sorted = sortOutcome(distributionOf(), 'effectif');
		if (sorted.kind !== 'distribution') throw new Error('distribution attendue');

		const counts = sorted.distribution.bars
			.filter((bar) => !bar.isNonResponse)
			.map((bar) => bar.count);
		expect(counts).toEqual([...counts].sort((a, b) => (b ?? 0) - (a ?? 0)));
	});

	it('laisse la non-reponse fermer la marche, quel que soit son effectif', () => {
		const sorted = sortOutcome(distributionOf(), 'effectif');
		if (sorted.kind !== 'distribution') throw new Error('distribution attendue');

		const last = sorted.distribution.bars[sorted.distribution.bars.length - 1];
		expect(last?.isNonResponse).toBe(true);
	});

	it('ne touche a rien en mode questionnaire', () => {
		const outcome = distributionOf();

		expect(sortOutcome(outcome, 'questionnaire')).toBe(outcome);
	});

	it('ne change aucun effectif', () => {
		const before = distributionOf();
		const after = sortOutcome(before, 'effectif');
		if (before.kind !== 'distribution' || after.kind !== 'distribution') {
			throw new Error('distribution attendue');
		}

		const total = (result: typeof before.distribution) =>
			result.bars.reduce((sum, bar) => sum + (bar.count ?? 0), 0);
		expect(total(after.distribution)).toBe(total(before.distribution));
	});

	it('repousse les cases masquees apres les cases publiees', () => {
		const sorted = sortOutcome(distributionOf({ threshold: 3 }), 'effectif');
		if (sorted.kind !== 'distribution') throw new Error('distribution attendue');

		const published = sorted.distribution.bars.filter((bar) => !bar.suppressed);
		const masked = sorted.distribution.bars.filter((bar) => bar.suppressed);
		expect(sorted.distribution.bars.slice(0, published.length)).toEqual(published);
		expect(masked.length).toBeGreaterThan(0);
	});

	it('classe les lignes d un croisement par effectif de ligne', () => {
		const outcome = buildOutcome({
			x: X,
			y: Y,
			population: everyone(6),
			threshold: 1,
			includeNonResponses: true
		});
		const sorted = sortOutcome(outcome, 'effectif');
		if (sorted.kind !== 'crosstab') throw new Error('croisement attendu');

		const totals = sorted.crosstab.xModalities
			.filter((modality) => !modality.isNonResponse)
			.map((modality) => sorted.crosstab.rowTotals.get(modality.key) ?? 0);
		expect(totals).toEqual([...totals].sort((a, b) => (b ?? 0) - (a ?? 0)));
	});

	it('ne publie pas un resultat sous le seuil sous pretexte de le trier', () => {
		const outcome = distributionOf({ threshold: 50 });

		expect(sortOutcome(outcome, 'effectif').kind).toBe('too-small');
	});
});

describe('selectAxes, troisieme question', () => {
	const crossable = [{ code: 'priorite' }, { code: 'region' }, { code: 'age' }];

	it('retient les trois questions demandees', () => {
		expect(selectAxes(crossable, { x: 'priorite', y: 'region', z: 'age' })).toEqual({
			x: { code: 'priorite' },
			y: { code: 'region' },
			z: { code: 'age' }
		});
	});

	it('refuse de decouper par une question deja portee en axe', () => {
		// Se decouper par sa propre abscisse ne produit que des panneaux a une
		// seule barre.
		expect(selectAxes(crossable, { x: 'priorite', y: 'region', z: 'priorite' }).z).toBeNull();
		expect(selectAxes(crossable, { x: 'priorite', y: 'region', z: 'region' }).z).toBeNull();
	});

	it('ignore un decoupage dont la question a disparu', () => {
		expect(selectAxes(crossable, { x: 'priorite', y: null, z: 'disparue' }).z).toBeNull();
	});

	it('n exige pas de croisement pour decouper', () => {
		const { y, z } = selectAxes(crossable, { x: 'priorite', y: null, z: 'age' });

		expect(y).toBeNull();
		expect(z).toEqual({ code: 'age' });
	});
});

describe('buildPanels', () => {
	const inputs = {
		x: X,
		y: null,
		population: everyone(6),
		threshold: 1,
		includeNonResponses: true
	};

	it('rend un panneau par modalite de decoupage', () => {
		const panels = buildPanels(inputs, Y);

		expect(panels.map((panel) => panel.key)).toEqual(['bre', 'nor']);
	});

	it('ne compte dans chaque panneau que sa sous-population', () => {
		const [bretagne] = buildPanels(inputs, Y);

		expect(bretagne?.size).toBe(3);
		if (bretagne?.outcome.kind !== 'distribution') throw new Error('distribution attendue');
		expect(bretagne.outcome.distribution.respondents).toBe(3);
	});

	it('protege chaque panneau separement', () => {
		// Trois repondants par region : sous un seuil de 5, aucun panneau ne
		// publie quoi que ce soit, pas meme son effectif.
		const panels = buildPanels({ ...inputs, threshold: 5 }, Y);

		expect(panels.every((panel) => panel.outcome.kind === 'too-small')).toBe(true);
		expect(panels.every((panel) => panel.size === null)).toBe(true);
	});

	it('respecte les filtres deja appliques', () => {
		const panels = buildPanels({ ...inputs, population: BRETONS }, Y);
		const normandie = panels.find((panel) => panel.key === 'nor');

		// La population est deja restreinte a la Bretagne : le panneau normand
		// est vide, et non rempli des Normands que le filtre avait ecartes.
		expect(normandie?.size).toBe(null);
	});

	it('retire la non-reponse des panneaux quand elle est masquee a l affichage', () => {
		const withNonResponse: Axis = {
			...Y,
			modalities: [...Y.modalities, { key: '__nr__', label: 'Sans réponse', isNonResponse: true }]
		};

		const shown = buildPanels(inputs, withNonResponse);
		const hidden = buildPanels({ ...inputs, includeNonResponses: false }, withNonResponse);

		expect(shown).toHaveLength(3);
		expect(hidden).toHaveLength(2);
	});

	it('garde le croisement a l interieur de chaque panneau', () => {
		const panels = buildPanels({ ...inputs, y: Y }, X);

		expect(panels.length).toBeGreaterThan(0);
		expect(panels.some((panel) => panel.outcome.kind === 'crosstab')).toBe(true);
	});
});

describe('lecture redressee', () => {
	/** Les Bretons pesent double, les Normands moitie. */
	const WEIGHTS = new Map([
		['r1', 2],
		['r2', 2],
		['r3', 2],
		['r4', 0.5],
		['r5', 0.5],
		['r6', 0.5]
	]);

	it('rend les parts ponderees, et garde le nombre reel de repondants comme base', () => {
		const outcome = distributionOf({ weights: WEIGHTS });
		if (outcome.kind !== 'distribution') throw new Error('distribution attendue');

		const pouvoir = outcome.distribution.bars.find((bar) => bar.key === 'pouvoir-achat');
		expect(pouvoir?.count).toBe(4);
		expect(pouvoir?.share).toBeCloseTo(4 / 7.5, 6);
		expect(outcome.distribution.respondents).toBe(6);
	});

	it('ne change rien sans poids', () => {
		const outcome = distributionOf();
		if (outcome.kind !== 'distribution') throw new Error('distribution attendue');

		const pouvoir = outcome.distribution.bars.find((bar) => bar.key === 'pouvoir-achat');
		expect(pouvoir?.count).toBe(2);
		expect(pouvoir?.share).toBeCloseTo(2 / 6, 6);
	});

	it('ne rouvre pas une case masquee en brut', () => {
		const outcome = distributionOf({ weights: WEIGHTS, threshold: 3 });
		if (outcome.kind !== 'distribution') throw new Error('distribution attendue');

		const pouvoir = outcome.distribution.bars.find((bar) => bar.key === 'pouvoir-achat');
		expect(pouvoir?.suppressed).toBe(true);
		expect(pouvoir?.count).toBeNull();
		expect(pouvoir?.share).toBeNull();
	});

	it('pondere aussi les totaux d un croisement', () => {
		const outcome = distributionOf({ y: Y, weights: WEIGHTS });
		if (outcome.kind !== 'crosstab') throw new Error('croisement attendu');

		expect(outcome.crosstab.rowTotals.get('pouvoir-achat')).toBeCloseTo(4, 6);
		expect(outcome.crosstab.columnTotals.get('nor')).toBeCloseTo(1.5, 6);
		expect(outcome.crosstab.cells.get('sante')?.get('nor')?.share).toBeCloseTo(1, 6);
	});
});

describe('regroupement par blocs', () => {
	const VOTE: Axis = {
		code: 'vote',
		label: 'Vote',
		modalities: [
			{ key: 'lfi', label: 'LFI', isNonResponse: false },
			{ key: 'ps', label: 'PS', isNonResponse: false },
			{ key: 'rn', label: 'RN', isNonResponse: false },
			{ key: 'blanc', label: 'Blanc', isNonResponse: false }
		],
		rows: [
			{ responseId: 'a', modalityKey: 'lfi' },
			{ responseId: 'b', modalityKey: 'ps' },
			{ responseId: 'c', modalityKey: 'rn' },
			{ responseId: 'd', modalityKey: 'blanc' }
		]
	};
	const blocs = blocsOf({
		blocs: [
			{ label: 'Gauche', codes: ['lfi', 'ps'] },
			{ label: 'Droite', codes: ['rn'] },
			{ label: 42 }
		]
	});

	it('ignore un bloc mal forme', () => {
		expect(blocs.map((bloc) => bloc.label)).toEqual(['Gauche', 'Droite']);
	});

	it('compte chaque bloc en personnes, et garde les modalites hors bloc', () => {
		const outcome = buildOutcome({
			x: groupAxis(VOTE, blocs),
			y: null,
			population: everyone(4),
			threshold: 1,
			includeNonResponses: false
		});
		if (outcome.kind !== 'distribution') throw new Error('distribution attendue');

		expect(outcome.distribution.bars.map((bar) => [bar.label, bar.count])).toEqual([
			['Gauche', 2],
			['Droite', 1],
			['Blanc', 1]
		]);
	});
});
