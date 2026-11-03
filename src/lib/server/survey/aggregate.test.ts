import { describe, expect, it } from 'vitest';
import { NON_RESPONSE_KEY, type ModalityDescriptor } from '$lib/shared/questions';
import { crosstab, distribution, orderModalities, type AnswerRow } from './aggregate';

function modality(key: string, isNonResponse = false): ModalityDescriptor {
	return { key, label: key.toUpperCase(), isNonResponse, color: null };
}

const YES_NO: ModalityDescriptor[] = [
	modality('oui'),
	modality('non'),
	modality(NON_RESPONSE_KEY, true)
];

/** Fabrique n reponses a une meme modalite, avec des identifiants distincts. */
function answers(modalityKey: string, count: number, prefix = 'r'): AnswerRow[] {
	return Array.from({ length: count }, (_, index) => ({
		responseId: `${prefix}${modalityKey}${index}`,
		modalityKey
	}));
}

describe('orderModalities', () => {
	it('place la non-reponse en dernier', () => {
		const ordered = orderModalities(YES_NO, ['oui', 'non', NON_RESPONSE_KEY]);

		expect(ordered.at(-1)?.key).toBe(NON_RESPONSE_KEY);
	});

	it('ajoute les modalites observees mais non declarees, triees naturellement', () => {
		const ordered = orderModalities([modality(NON_RESPONSE_KEY, true)], ['10', '9', '2']);

		expect(ordered.map((item) => item.key)).toEqual(['2', '9', '10', NON_RESPONSE_KEY]);
	});

	it('ne duplique pas une modalite deja declaree', () => {
		const ordered = orderModalities(YES_NO, ['oui', 'oui', 'non']);

		expect(ordered.filter((item) => item.key === 'oui')).toHaveLength(1);
	});
});

describe('distribution', () => {
	it('compte les modalites et calcule leur part', () => {
		const rows = [...answers('oui', 60), ...answers('non', 40)];
		const result = distribution(rows, YES_NO);

		expect(result.respondents).toBe(100);
		expect(result.bars.find((bar) => bar.key === 'oui')?.count).toBe(60);
		expect(result.bars.find((bar) => bar.key === 'oui')?.share).toBeCloseTo(0.6);
	});

	it('compte la non-reponse comme une modalite ordinaire', () => {
		const rows = [...answers('oui', 50), ...answers(NON_RESPONSE_KEY, 30)];
		const result = distribution(rows, YES_NO);

		const nonResponse = result.bars.find((bar) => bar.key === NON_RESPONSE_KEY);
		expect(nonResponse?.count).toBe(30);
		// La non-reponse pese dans la base : 50 sur 80, pas 50 sur 50.
		expect(result.respondents).toBe(80);
		expect(result.bars.find((bar) => bar.key === 'oui')?.share).toBeCloseTo(50 / 80);
	});

	it('retire la non-reponse de la base quand on la retire de l affichage', () => {
		const rows = [...answers('oui', 50), ...answers(NON_RESPONSE_KEY, 30)];
		const result = distribution(rows, YES_NO, { includeNonResponses: false });

		expect(result.bars.some((bar) => bar.isNonResponse)).toBe(false);
		// Les personnes a qui la question n a pas ete posee ne comptent pas : les
		// parts restantes somment a 100 %.
		expect(result.respondents).toBe(50);
		expect(result.bars.find((bar) => bar.key === 'oui')?.share).toBe(1);
	});

	it('ne compte qu une fois un repondant ayant coche plusieurs modalites', () => {
		const rows: AnswerRow[] = [
			{ responseId: 'a', modalityKey: 'oui' },
			{ responseId: 'a', modalityKey: 'non' },
			...answers('oui', 20)
		];
		// Seuil a 1 : ce test porte sur le comptage, pas sur le masquage.
		const result = distribution(rows, YES_NO, { threshold: 1 });

		expect(result.respondents).toBe(21);
		// La somme des parts depasse 100 % : lecture attendue d un choix multiple.
		const total = result.bars.reduce((acc, bar) => acc + (bar.share ?? 0), 0);
		expect(total).toBeGreaterThan(1);
	});

	it('ignore une reponse dupliquee a l identique', () => {
		const rows: AnswerRow[] = [
			{ responseId: 'a', modalityKey: 'oui' },
			{ responseId: 'a', modalityKey: 'oui' }
		];
		const result = distribution(rows, YES_NO, { threshold: 1 });

		expect(result.bars.find((bar) => bar.key === 'oui')?.count).toBe(1);
	});

	it('masque une modalite sous le seuil et n en publie pas la part', () => {
		const rows = [...answers('oui', 80), ...answers('non', 2)];
		const result = distribution(rows, YES_NO, { threshold: 5 });

		const hidden = result.bars.find((bar) => bar.key === 'non');
		expect(hidden?.suppressed).toBe(true);
		expect(hidden?.count).toBeNull();
		expect(hidden?.share).toBeNull();
	});

	it('ne divise pas par zero quand il n y a aucune reponse', () => {
		const result = distribution([], YES_NO);

		expect(result.respondents).toBe(0);
		expect(result.bars.every((bar) => bar.share === null)).toBe(true);
	});
});

describe('crosstab', () => {
	const REGIONS: ModalityDescriptor[] = [
		modality('bretagne'),
		modality('occitanie'),
		modality(NON_RESPONSE_KEY, true)
	];

	/** Un repondant, sa region et son intention de vote. */
	function respondent(id: string, region: string, vote: string) {
		return {
			x: { responseId: id, modalityKey: region },
			y: { responseId: id, modalityKey: vote }
		};
	}

	function build(entries: ReturnType<typeof respondent>[]) {
		return {
			x: entries.map((entry) => entry.x),
			y: entries.map((entry) => entry.y)
		};
	}

	it('croise deux questions par repondant', () => {
		const entries = [
			...Array.from({ length: 30 }, (_, i) => respondent(`a${i}`, 'bretagne', 'oui')),
			...Array.from({ length: 20 }, (_, i) => respondent(`b${i}`, 'bretagne', 'non')),
			...Array.from({ length: 25 }, (_, i) => respondent(`c${i}`, 'occitanie', 'oui'))
		];
		const { x, y } = build(entries);

		const result = crosstab(x, y, REGIONS, YES_NO, { threshold: 5 });

		expect(result.cells.get('bretagne')?.get('oui')?.count).toBe(30);
		expect(result.cells.get('bretagne')?.get('non')?.count).toBe(20);
		expect(result.rowTotals.get('bretagne')).toBe(50);
		expect(result.respondents).toBe(75);
	});

	it('calcule la part en ligne, lecture usuelle d un tri croise', () => {
		const entries = [
			...Array.from({ length: 30 }, (_, i) => respondent(`a${i}`, 'bretagne', 'oui')),
			...Array.from({ length: 10 }, (_, i) => respondent(`b${i}`, 'bretagne', 'non'))
		];
		const { x, y } = build(entries);

		const result = crosstab(x, y, REGIONS, YES_NO, { threshold: 5 });

		expect(result.cells.get('bretagne')?.get('oui')?.share).toBeCloseTo(0.75);
	});

	it('ignore un repondant qui n a repondu qu a une des deux questions', () => {
		const x: AnswerRow[] = [{ responseId: 'seul', modalityKey: 'bretagne' }];
		const y: AnswerRow[] = [{ responseId: 'autre', modalityKey: 'oui' }];

		const result = crosstab(x, y, REGIONS, YES_NO, { threshold: 5 });

		expect(result.respondents).toBe(0);
	});

	it('masque les cases sous le seuil et resiste a la soustraction', () => {
		const entries = [
			...Array.from({ length: 40 }, (_, i) => respondent(`a${i}`, 'bretagne', 'oui')),
			...Array.from({ length: 2 }, (_, i) => respondent(`b${i}`, 'bretagne', 'non')),
			...Array.from({ length: 30 }, (_, i) => respondent(`c${i}`, 'occitanie', 'oui')),
			...Array.from({ length: 30 }, (_, i) => respondent(`d${i}`, 'occitanie', 'non'))
		];
		const { x, y } = build(entries);

		const result = crosstab(x, y, REGIONS, YES_NO, { threshold: 5 });

		expect(result.cells.get('bretagne')?.get('non')?.suppressed).toBe(true);

		// Aucune ligne ne doit compter exactement une case masquee : ce serait la
		// rendre calculable par difference avec le total de ligne.
		for (const xModality of result.xModalities) {
			const row = result.cells.get(xModality.key);
			const suppressed = [...(row?.values() ?? [])].filter((cell) => cell.suppressed).length;
			expect(suppressed === 0 || suppressed >= 2).toBe(true);
		}
	});

	it('apparie toutes les combinaisons quand un repondant a coche plusieurs modalites', () => {
		const x: AnswerRow[] = [
			{ responseId: 'a', modalityKey: 'bretagne' },
			{ responseId: 'a', modalityKey: 'occitanie' }
		];
		const y: AnswerRow[] = [{ responseId: 'a', modalityKey: 'oui' }];

		const result = crosstab(x, y, REGIONS, YES_NO, { threshold: 1 });

		expect(result.cells.get('bretagne')?.get('oui')?.count).toBe(1);
		expect(result.cells.get('occitanie')?.get('oui')?.count).toBe(1);
		expect(result.respondents).toBe(1);
	});
});

describe('cas limites d agregation', () => {
	it('trie alphabetiquement des modalites non numeriques non declarees', () => {
		const ordered = orderModalities([], ['zebre', 'alpha', 'mimosa']);

		expect(ordered.map((item) => item.key)).toEqual(['alpha', 'mimosa', 'zebre']);
	});

	it('trie les cles numeriques egales de facon stable', () => {
		const ordered = orderModalities([], ['10', '10.0']);

		expect(ordered).toHaveLength(2);
	});

	it('apparie un repondant ayant plusieurs modalites sur l axe croise', () => {
		const x: AnswerRow[] = [{ responseId: 'a', modalityKey: 'bretagne' }];
		const y: AnswerRow[] = [
			{ responseId: 'a', modalityKey: 'sante' },
			{ responseId: 'a', modalityKey: 'ecologie' }
		];

		const result = crosstab(x, y, [], [], { threshold: 1 });

		expect(result.cells.get('bretagne')?.get('sante')?.count).toBe(1);
		expect(result.cells.get('bretagne')?.get('ecologie')?.count).toBe(1);
	});

	it('ne compte pas deux fois un couple produit deux fois par le meme repondant', () => {
		const x: AnswerRow[] = [
			{ responseId: 'a', modalityKey: 'bretagne' },
			{ responseId: 'a', modalityKey: 'bretagne' }
		];
		const y: AnswerRow[] = [{ responseId: 'a', modalityKey: 'sante' }];

		const result = crosstab(x, y, [], [], { threshold: 1 });

		expect(result.cells.get('bretagne')?.get('sante')?.count).toBe(1);
	});
});

describe('redressement', () => {
	/** Poids : les « oui » comptent double, les « non » pour un. */
	function doubleTheYes(rows: readonly AnswerRow[]): Map<string, number> {
		return new Map(rows.map((row) => [row.responseId, row.modalityKey === 'oui' ? 2 : 1]));
	}

	it('ne rend aucun chiffre redresse quand aucun poids n est fourni', () => {
		const rows = [...answers('oui', 6), ...answers('non', 6)];
		const result = distribution(rows, YES_NO);

		expect(result.weightedRespondents).toBeNull();
		expect(result.bars.every((bar) => bar.weightedCount === null)).toBe(true);
	});

	it('laisse le comptage brut intact quand un redressement est actif', () => {
		const rows = [...answers('oui', 6), ...answers('non', 6)];
		const result = distribution(rows, YES_NO, { weights: doubleTheYes(rows) });

		const oui = result.bars.find((bar) => bar.key === 'oui');
		expect(oui?.count).toBe(6);
		expect(oui?.share).toBeCloseTo(0.5, 6);
		expect(oui?.weightedCount).toBe(12);
		expect(oui?.weightedShare).toBeCloseTo(12 / 18, 6);
	});

	it('UNE CASE MASQUEE EN BRUT RESTE MASQUEE EN REDRESSE', () => {
		// Le point de surete du fichier : trois repondants peses 2,0 font 6,0, et
		// un seuil compare a 6,0 publierait une case qui ne repose que sur trois
		// personnes.
		const rows = [...answers('oui', 3), ...answers('non', 40)];
		const result = distribution(rows, YES_NO, { threshold: 5, weights: doubleTheYes(rows) });

		const oui = result.bars.find((bar) => bar.key === 'oui');
		expect(oui?.suppressed).toBe(true);
		expect(oui?.count).toBeNull();
		expect(oui?.weightedCount).toBeNull();
		expect(oui?.weightedShare).toBeNull();
	});

	it('pese aussi les cases d un tableau croise, sans deplacer le masquage', () => {
		const rows: AnswerRow[] = [
			{ responseId: 'a', modalityKey: 'oui' },
			{ responseId: 'b', modalityKey: 'oui' },
			{ responseId: 'c', modalityKey: 'non' }
		];
		const region: AnswerRow[] = [
			{ responseId: 'a', modalityKey: 'bretagne' },
			{ responseId: 'b', modalityKey: 'bretagne' },
			{ responseId: 'c', modalityKey: 'bretagne' }
		];
		const weights = new Map([
			['a', 3],
			['b', 3],
			['c', 1]
		]);

		const table = crosstab(rows, region, YES_NO, [modality('bretagne')], {
			threshold: 1,
			weights
		});

		const cell = table.cells.get('oui')?.get('bretagne');
		expect(cell?.count).toBe(2);
		expect(cell?.weightedCount).toBe(6);
		// Part au sein de la ligne « oui » : la base redressee est celle de la ligne.
		expect(cell?.weightedShare).toBeCloseTo(1, 6);
	});

	it('rend des totaux redresses coherents avec les cases, et masques comme les bruts', () => {
		const rows: AnswerRow[] = [
			{ responseId: 'a', modalityKey: 'oui' },
			{ responseId: 'b', modalityKey: 'non' },
			{ responseId: 'c', modalityKey: 'non' }
		];
		const region: AnswerRow[] = [
			{ responseId: 'a', modalityKey: 'bretagne' },
			{ responseId: 'b', modalityKey: 'bretagne' },
			{ responseId: 'c', modalityKey: 'normandie' }
		];
		const weights = new Map([
			['a', 2],
			['b', 0.5],
			['c', 0.5]
		]);

		const table = crosstab(rows, region, YES_NO, [modality('bretagne'), modality('normandie')], {
			threshold: 1,
			weights
		});

		expect(table.weighted?.rowTotals.get('oui')).toBeCloseTo(2, 6);
		expect(table.weighted?.rowTotals.get('non')).toBeCloseTo(1, 6);
		expect(table.weighted?.columnTotals.get('bretagne')).toBeCloseTo(2.5, 6);
		expect(table.weighted?.respondents).toBeCloseTo(3, 6);
		// La base brute ne bouge pas.
		expect(table.respondents).toBe(3);
	});

	it('ne rend aucun total redresse sans poids', () => {
		const table = crosstab(answers('oui', 3), answers('oui', 3), YES_NO, YES_NO, { threshold: 1 });
		expect(table.weighted).toBeNull();
	});

	it('compte le repondant sans poids connu pour 1, jamais pour 0', () => {
		// Un repondant arrive apres le calcul des poids ne doit pas disparaitre du
		// total : il pese 1, comme avant tout redressement.
		const rows = [...answers('oui', 2)];
		const result = distribution(rows, YES_NO, { weights: new Map() });

		expect(result.weightedRespondents).toBe(2);
	});
});
