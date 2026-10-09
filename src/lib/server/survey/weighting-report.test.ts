import { describe, expect, it } from 'vitest';
import { NON_RESPONSE_KEY, type ModalityDescriptor } from '$lib/shared/questions';
import type { AnswerRow } from './aggregate';
import {
	compareBySubgroup,
	compareQuestion,
	effectiveSize,
	largestShifts,
	marginOfError,
	resolveSubgroupSelection,
	type QuestionComparison,
	type ReportQuestion
} from './weighting-report';

function modality(key: string, isNonResponse = false): ModalityDescriptor {
	return { key, label: key.toUpperCase(), isNonResponse, color: null };
}

/** Reponses des personnes `from` a `to` (bornes comprises) a une meme modalite. */
function range(from: number, to: number, modalityKey: string): AnswerRow[] {
	return Array.from({ length: to - from + 1 }, (_, index) => ({
		responseId: `p${from + index}`,
		modalityKey
	}));
}

/*
 * Cent repondants, dont soixante femmes pour une population a parts egales.
 * Les femmes repondent « oui » a 60 %, les hommes a 40 % : le brut donne 52 %,
 * le redresse 50 %, et le calcul se refait a la main.
 */
const GENDER: ReportQuestion = {
	code: 'genre',
	label: 'Genre',
	modalities: [modality('f'), modality('h')],
	rows: [...range(1, 60, 'f'), ...range(61, 100, 'h')]
};

const OPINION: ReportQuestion = {
	code: 'avis',
	label: 'Êtes-vous d’accord ?',
	modalities: [modality('oui'), modality('non'), modality(NON_RESPONSE_KEY, true)],
	rows: [
		...range(1, 36, 'oui'),
		...range(37, 60, 'non'),
		...range(61, 76, 'oui'),
		...range(77, 100, 'non')
	]
};

const WEIGHTS = new Map<string, number>(
	Array.from({ length: 100 }, (_, index) => [`p${index + 1}`, index < 60 ? 50 / 60 : 50 / 40])
);

describe('marginOfError', () => {
	it('donne la demi-largeur a 95 % d une part', () => {
		expect(marginOfError(0.5, 100)).toBeCloseTo(0.098, 3);
	});

	it('ne donne rien sans part ou sans base', () => {
		expect(marginOfError(null, 100)).toBeNull();
		expect(marginOfError(0.5, 0)).toBeNull();
	});
});

describe('effectiveSize', () => {
	it('applique la formule de Kish', () => {
		expect(
			effectiveSize(
				['p1', 'p100'],
				new Map([
					['p1', 1],
					['p100', 3]
				])
			)
		).toBeCloseTo(1.6);
	});

	it('compte un repondant sans poids pour un', () => {
		expect(effectiveSize(['inconnu', 'autre'], new Map())).toBeCloseTo(2);
	});
});

describe('compareQuestion', () => {
	const comparison = compareQuestion(OPINION, WEIGHTS, 5);
	const yes = comparison.rows.find((row) => row.key === 'oui')!;

	it('lit la meme modalite brute et redressee', () => {
		expect(yes.raw).toBeCloseTo(0.52);
		expect(yes.weighted).toBeCloseTo(0.5);
		expect(yes.gap).toBeCloseTo(-0.02);
	});

	it('calcule la marge brute sur les repondants et la redressee sur la taille effective', () => {
		expect(comparison.respondents).toBe(100);
		expect(comparison.effectiveRespondents).toBeCloseTo(96);
		expect(yes.rawMargin).toBeCloseTo(marginOfError(0.52, 100)!);
		expect(yes.weightedMargin).toBeCloseTo(marginOfError(0.5, 96)!);
	});

	it('ne signale pas un ecart plus petit que la marge d erreur', () => {
		expect(yes.beyondMargin).toBe(false);
	});

	it('garde la non-reponse comme une modalite', () => {
		expect(comparison.rows.map((row) => row.key)).toContain(NON_RESPONSE_KEY);
	});

	it('masque en brut et en redresse une case sous le seuil', () => {
		const rows = [
			...OPINION.rows.filter((row) => row.responseId !== 'p1'),
			{ responseId: 'p1', modalityKey: NON_RESPONSE_KEY }
		];
		const masked = compareQuestion({ ...OPINION, rows }, WEIGHTS, 5);
		const nonResponse = masked.rows.find((row) => row.key === NON_RESPONSE_KEY)!;

		expect(nonResponse.suppressed).toBe(true);
		expect(nonResponse.raw).toBeNull();
		expect(nonResponse.weighted).toBeNull();
		expect(nonResponse.gap).toBeNull();
		expect(nonResponse.rawMargin).toBeNull();
	});

	it('signale un ecart qui depasse la marge d erreur du brut', () => {
		const heavy = new Map(
			[...WEIGHTS].map(([id, weight]) => [id, Number(id.slice(1)) <= 60 ? 0.2 : weight * 4])
		);
		const shifted = compareQuestion(OPINION, heavy, 5).rows.find((row) => row.key === 'oui')!;

		expect(Math.abs(shifted.gap!)).toBeGreaterThan(shifted.rawMargin!);
		expect(shifted.beyondMargin).toBe(true);
	});
});

describe('largestShifts', () => {
	function comparison(code: string, gaps: (number | null)[]): QuestionComparison {
		return {
			code,
			label: code,
			respondents: 100,
			effectiveRespondents: 90,
			rows: gaps.map((gap, index) => ({
				key: `${code}${index}`,
				label: `${code}${index}`,
				isNonResponse: false,
				suppressed: gap === null,
				raw: gap === null ? null : 0.5,
				weighted: gap === null ? null : 0.5 + gap,
				gap,
				rawMargin: null,
				weightedMargin: null,
				beyondMargin: false
			}))
		};
	}

	it('classe par ecart absolu, toutes questions confondues', () => {
		const shifts = largestShifts([comparison('a', [0.01, -0.05]), comparison('b', [0.03])]);

		expect(shifts.map((shift) => shift.row.key)).toEqual(['a1', 'b0', 'a0']);
		expect(shifts[0]?.questionCode).toBe('a');
	});

	it('ecarte les cases masquees et respecte la limite', () => {
		const shifts = largestShifts([comparison('a', [null, 0.02, 0.01, 0.04])], 2);

		expect(shifts.map((shift) => shift.row.key)).toEqual(['a3', 'a1']);
	});

	it('garde l ordre de lecture a ecart egal', () => {
		const shifts = largestShifts([comparison('a', [0.02, -0.02])]);

		expect(shifts.map((shift) => shift.row.key)).toEqual(['a0', 'a1']);
	});
});

describe('compareBySubgroup', () => {
	it('lit la part de chaque sous-groupe, brute et redressee', () => {
		const result = compareBySubgroup(GENDER, OPINION, 'oui', WEIGHTS, 5)!;
		const women = result.rows.find((row) => row.key === 'f')!;

		expect(result.modality).toEqual({ key: 'oui', label: 'OUI' });
		expect(women.raw).toBeCloseTo(0.6);
		// Dans un sous-groupe de calage, tous les poids sont egaux : rien ne bouge.
		expect(women.weighted).toBeCloseTo(0.6);
		expect(women.gap).toBeCloseTo(0);
		expect(women.respondents).toBe(60);
		expect(women.effectiveRespondents).toBeCloseTo(60);
		expect(women.rawMargin).toBeCloseTo(marginOfError(0.6, 60)!);
	});

	it('ne compte dans un sous-groupe que les personnes qui ont repondu a la question', () => {
		const partial = { ...OPINION, rows: OPINION.rows.filter((row) => row.responseId !== 'p100') };
		const men = compareBySubgroup(GENDER, partial, 'oui', WEIGHTS, 5)!.rows.find(
			(row) => row.key === 'h'
		)!;

		expect(men.respondents).toBe(39);
		expect(men.raw).toBeCloseTo(16 / 39);
	});

	it('masque une modalite de sous-groupe sans personne', () => {
		const group = { ...GENDER, modalities: [...GENDER.modalities, modality('vide')] };
		const empty = compareBySubgroup(group, OPINION, 'oui', WEIGHTS, 5)!.rows.find(
			(row) => row.key === 'vide'
		)!;

		expect(empty.suppressed).toBe(true);
		expect(empty.respondents).toBeNull();
	});

	it('rend null pour une modalite inconnue', () => {
		expect(compareBySubgroup(GENDER, OPINION, 'inconnue', WEIGHTS, 5)).toBeNull();
	});

	it('masque un sous-groupe dont une case passe sous le seuil', () => {
		const group: ReportQuestion = {
			...GENDER,
			modalities: [...GENDER.modalities, modality('x')],
			rows: [
				...GENDER.rows.filter((row) => row.responseId !== 'p1'),
				{ responseId: 'p1', modalityKey: 'x' }
			]
		};
		const other = compareBySubgroup(group, OPINION, 'oui', WEIGHTS, 5)!.rows.find(
			(row) => row.key === 'x'
		)!;

		expect(other.suppressed).toBe(true);
		expect(other.respondents).toBeNull();
		expect(other.raw).toBeNull();
	});

	it('masque un sous-groupe de trop peu de personnes, meme quand ses couples passent le seuil', () => {
		// Trois personnes cochent deux cases : six couples, mais trois personnes.
		const multiple: ReportQuestion = {
			code: 'medias',
			label: 'Médias',
			modalities: [modality('a'), modality('b'), modality('c')],
			rows: [...range(1, 3, 'a'), ...range(1, 3, 'b'), ...range(4, 100, 'c')]
		};
		const group: ReportQuestion = {
			code: 'groupe',
			label: 'Groupe',
			modalities: [modality('petit'), modality('grand')],
			rows: [...range(1, 3, 'petit'), ...range(4, 100, 'grand')]
		};

		const small = compareBySubgroup(group, multiple, 'c', WEIGHTS, 5)!.rows.find(
			(row) => row.key === 'petit'
		)!;

		expect(small.suppressed).toBe(true);
		expect(small.raw).toBeNull();
	});
});

describe('resolveSubgroupSelection', () => {
	const comparisons = [compareQuestion(OPINION, WEIGHTS, 5)];
	const none = { question: null, modality: null, group: null };

	it('garde un choix valide', () => {
		expect(
			resolveSubgroupSelection(
				{ question: 'avis', modality: 'non', group: 'age' },
				comparisons,
				['genre', 'age', 'avis'],
				['genre']
			)
		).toEqual({ question: 'avis', modality: 'non', group: 'age' });
	});

	it('choisit par defaut la reponse la plus deplacee et la premiere variable de calage', () => {
		expect(
			resolveSubgroupSelection(none, comparisons, ['age', 'genre', 'avis'], ['genre'])
		).toEqual({ question: 'avis', modality: 'oui', group: 'genre' });
	});

	it('ramene un parametre inconnu au choix par defaut', () => {
		expect(
			resolveSubgroupSelection(
				{ question: 'inconnue', modality: 'peut-etre', group: 'avis' },
				comparisons,
				['avis', 'age'],
				[]
			)
		).toEqual({ question: 'avis', modality: 'oui', group: 'age' });
	});

	it('prend la premiere reponse quand rien ne bouge', () => {
		const flat = compareQuestion(OPINION, new Map(), 5);
		expect(resolveSubgroupSelection(none, [flat], ['genre'], [])?.modality).toBe('oui');
	});

	it('ne propose rien sans question, sans sous-groupe ou sans reponse', () => {
		expect(resolveSubgroupSelection(none, [], ['genre'], [])).toBeNull();
		expect(resolveSubgroupSelection(none, comparisons, ['avis'], [])).toBeNull();
		const empty: QuestionComparison = { ...comparisons[0]!, rows: [] };
		expect(resolveSubgroupSelection(none, [empty], ['genre'], [])).toBeNull();
	});
});
