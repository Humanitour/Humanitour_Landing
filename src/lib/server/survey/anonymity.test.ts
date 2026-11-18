import { describe, expect, it } from 'vitest';
import {
	DEFAULT_K_THRESHOLD,
	pickThreshold,
	protectDistribution,
	protectTable,
	SINGLE_COLUMN_KEY,
	type ProtectedTable
} from './anonymity';

function cell(table: ProtectedTable, xKey: string, yKey: string) {
	const found = table.cells.find((item) => item.xKey === xKey && item.yKey === yKey);
	if (!found) throw new Error(`Case absente du resultat : ${xKey} / ${yKey}`);
	return found;
}

describe('protectTable', () => {
	it('publie les effectifs au-dessus du seuil', () => {
		const table = protectTable(
			[
				{ xKey: 'nord', yKey: 'oui', count: 40 },
				{ xKey: 'nord', yKey: 'non', count: 60 }
			],
			['nord'],
			['oui', 'non'],
			5
		);

		expect(cell(table, 'nord', 'oui').count).toBe(40);
		expect(cell(table, 'nord', 'non').count).toBe(60);
		expect(table.suppressedCount).toBe(0);
		expect(table.total).toBe(100);
	});

	it('masque les effectifs sous le seuil et ne laisse pas fuiter la valeur', () => {
		const table = protectTable(
			[
				{ xKey: 'nord', yKey: 'oui', count: 3 },
				{ xKey: 'nord', yKey: 'non', count: 60 },
				{ xKey: 'sud', yKey: 'oui', count: 20 },
				{ xKey: 'sud', yKey: 'non', count: 30 }
			],
			['nord', 'sud'],
			['oui', 'non'],
			5
		);

		const hidden = cell(table, 'nord', 'oui');
		expect(hidden.suppressed).toBe(true);
		expect(hidden.count).toBeNull();
	});

	it('publie les cases a zero : une modalite sans reponse ne revele personne', () => {
		const table = protectTable(
			[{ xKey: 'nord', yKey: 'non', count: 60 }],
			['nord'],
			['oui', 'non'],
			5
		);

		expect(cell(table, 'nord', 'oui').count).toBe(0);
		expect(cell(table, 'nord', 'oui').suppressed).toBe(false);
	});

	describe('resistance a la soustraction', () => {
		it('masque une seconde case quand une ligne n en compte qu une', () => {
			// 10 + 20 + 3, total 33 publie : sans seconde suppression, 33 - 10 - 20
			// redonne exactement le 3 qu on venait de masquer.
			const table = protectTable(
				[
					{ xKey: 'r1', yKey: 'a', count: 10 },
					{ xKey: 'r1', yKey: 'b', count: 20 },
					{ xKey: 'r1', yKey: 'c', count: 3 }
				],
				['r1'],
				['a', 'b', 'c'],
				5
			);

			expect(table.suppressedCount).toBe(2);

			const published = table.cells.filter((item) => !item.suppressed);
			const publishedSum = published.reduce((acc, item) => acc + (item.count ?? 0), 0);
			const rowTotal = table.rowTotals.get('r1');

			// L ecart entre le total et ce qui est publie doit rester indivisible :
			// il couvre au moins deux cases.
			expect(rowTotal).toBe(33);
			expect(rowTotal! - publishedSum).toBeGreaterThan(0);
			expect(table.cells.filter((item) => item.suppressed).length).toBeGreaterThanOrEqual(2);
		});

		it('choisit la plus petite case publiee comme suppression secondaire', () => {
			const table = protectTable(
				[
					{ xKey: 'r1', yKey: 'a', count: 90 },
					{ xKey: 'r1', yKey: 'b', count: 7 },
					{ xKey: 'r1', yKey: 'c', count: 2 }
				],
				['r1'],
				['a', 'b', 'c'],
				5
			);

			// « c » est masquee en primaire, « b » (7) coute moins cher que « a » (90).
			expect(cell(table, 'r1', 'c').suppressed).toBe(true);
			expect(cell(table, 'r1', 'b').suppressed).toBe(true);
			expect(cell(table, 'r1', 'a').count).toBe(90);
		});

		it('masque le total quand la ligne ne contient qu une seule case', () => {
			const table = protectTable([{ xKey: 'seul', yKey: 'a', count: 2 }], ['seul'], ['a'], 5);

			expect(cell(table, 'seul', 'a').suppressed).toBe(true);
			expect(table.rowTotals.get('seul')).toBeNull();
			expect(table.columnTotals.get('a')).toBeNull();
		});

		it('propage la suppression entre lignes et colonnes jusqu a stabilisation', () => {
			const table = protectTable(
				[
					{ xKey: 'r1', yKey: 'a', count: 3 },
					{ xKey: 'r1', yKey: 'b', count: 50 },
					{ xKey: 'r2', yKey: 'a', count: 40 },
					{ xKey: 'r2', yKey: 'b', count: 60 }
				],
				['r1', 'r2'],
				['a', 'b'],
				5
			);

			// (r1,a) masquee en primaire force (r1,b) en secondaire ; la colonne « b »
			// n a plus qu une case masquee, ce qui force (r2,b), et ainsi de suite.
			for (const item of table.cells) {
				const line = table.cells.filter((other) => other.xKey === item.xKey);
				const suppressed = line.filter((other) => other.suppressed).length;
				expect(suppressed === 0 || suppressed >= 2).toBe(true);
			}

			for (const key of ['a', 'b']) {
				const column = table.cells.filter((other) => other.yKey === key);
				const suppressed = column.filter((other) => other.suppressed).length;
				expect(suppressed === 0 || suppressed >= 2).toBe(true);
			}
		});
	});

	it('ne confond pas le total d une ligne et celui d une colonne de meme nom', () => {
		// Croiser deux questions qui partagent leurs codes de modalite : sans
		// separation des espaces de noms, masquer le total de la colonne « a »
		// masquerait aussi celui de la ligne « a ».
		const table = protectTable(
			[
				{ xKey: 'a', yKey: 'a', count: 3 },
				{ xKey: 'a', yKey: 'b', count: 10 }
			],
			['a'],
			['a', 'b'],
			5
		);

		expect(table.columnTotals.get('a')).toBeNull();
		expect(table.rowTotals.get('a')).toBe(13);
	});

	it('applique le seuil par defaut quand il n est pas precise', () => {
		const table = protectTable(
			[
				{ xKey: 'r1', yKey: 'a', count: DEFAULT_K_THRESHOLD - 1 },
				{ xKey: 'r1', yKey: 'b', count: 100 }
			],
			['r1'],
			['a', 'b']
		);

		expect(table.threshold).toBe(DEFAULT_K_THRESHOLD);
		expect(cell(table, 'r1', 'a').suppressed).toBe(true);
	});

	it('conserve le total general, qui est l effectif de l enquete', () => {
		const table = protectTable(
			[
				{ xKey: 'r1', yKey: 'a', count: 1 },
				{ xKey: 'r2', yKey: 'a', count: 2 }
			],
			['r1', 'r2'],
			['a'],
			5
		);

		expect(table.total).toBe(3);
	});
});

describe('protectDistribution', () => {
	it('protege une distribution simple contre la soustraction depuis le total', () => {
		const table = protectDistribution(
			new Map([
				['x', 50],
				['y', 40],
				['z', 3]
			]),
			['x', 'y', 'z'],
			5
		);

		expect(table.total).toBe(93);
		expect(cell(table, 'z', SINGLE_COLUMN_KEY).suppressed).toBe(true);

		const published = table.cells
			.filter((item) => !item.suppressed)
			.reduce((acc, item) => acc + (item.count ?? 0), 0);

		// L ecart doit couvrir au moins deux modalites, sinon il est divisible.
		expect(table.cells.filter((item) => item.suppressed).length).toBeGreaterThanOrEqual(2);
		expect(table.total - published).toBeGreaterThan(0);
	});

	it('complete les modalites absentes par zero', () => {
		const table = protectDistribution(new Map([['x', 10]]), ['x', 'y'], 5);

		expect(cell(table, 'y', SINGLE_COLUMN_KEY).count).toBe(0);
	});

	it('ne masque rien quand toutes les modalites depassent le seuil', () => {
		const table = protectDistribution(
			new Map([
				['x', 10],
				['y', 20]
			]),
			['x', 'y'],
			5
		);

		expect(table.suppressedCount).toBe(0);
	});
});

describe('pickThreshold', () => {
	it('donne la priorite a la surcharge du sondage', () => {
		expect(pickThreshold(10, 5)).toBe(10);
	});

	it('retombe sur le reglage global quand le sondage ne surcharge rien', () => {
		expect(pickThreshold(null, 8)).toBe(8);
	});

	it('retombe sur le defaut quand rien n est defini', () => {
		expect(pickThreshold(null, undefined)).toBe(DEFAULT_K_THRESHOLD);
	});

	it('accepte zero, qui leve le masquage, et rejette un negatif', () => {
		expect(pickThreshold(null, 0)).toBe(0);
		expect(pickThreshold(0, 7)).toBe(0);
		expect(pickThreshold(null, -3)).toBe(DEFAULT_K_THRESHOLD);
	});

	it('ne masque aucune case a un seuil de zero', () => {
		const table = protectTable(
			[
				{ xKey: 'r1', yKey: 'a', count: 1 },
				{ xKey: 'r1', yKey: 'b', count: 100 }
			],
			['r1'],
			['a', 'b'],
			0
		);

		expect(table.suppressedCount).toBe(0);
	});

	it('rejette un reglage qui n est pas un entier', () => {
		expect(pickThreshold(null, '5')).toBe(DEFAULT_K_THRESHOLD);
		expect(pickThreshold(null, 4.5)).toBe(DEFAULT_K_THRESHOLD);
		expect(pickThreshold(null, null)).toBe(DEFAULT_K_THRESHOLD);
	});
});
