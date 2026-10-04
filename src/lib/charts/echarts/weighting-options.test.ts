import { describe, expect, it } from 'vitest';
import {
	binLabel,
	convergenceOption,
	histogramRows,
	impactOption,
	marginComparisonOption,
	RAW_COLOR,
	WEIGHTED_COLOR,
	weightHistogramOption
} from './weighting-options';

type Serie = { name?: string; type: string; data: { value: number | null; label?: unknown }[] };

function series(option: Record<string, unknown>): Serie[] {
	return option.series as Serie[];
}

describe('marginComparisonOption', () => {
	const built = marginComparisonOption([
		{ label: 'Femme', observed: 0.64, weighted: 0.5223, target: 0.5223 },
		{ label: 'Homme', observed: 0.36, weighted: 0.4777, target: null }
	]);

	it('trace le brut, le redresse, et la cible en trait', () => {
		expect(series(built.option).map((serie) => [serie.name, serie.type])).toEqual([
			['Échantillon brut', 'bar'],
			['Redressé', 'bar'],
			['Cible', 'scatter']
		]);
	});

	it('met la premiere modalite en haut et ecrit les parts en pourcentage', () => {
		const [raw] = series(built.option);
		expect(raw?.data.map((point) => point.value)).toEqual([36, 64]);
		expect(series(built.option)[2]?.data[0]?.value).toBeNull();
	});

	it('grandit avec le nombre de modalites', () => {
		expect(marginComparisonOption([]).height).toBe(180);
		expect(built.height).toBeGreaterThanOrEqual(180);
	});
});

describe('impactOption', () => {
	it('compare brut et redresse, parts ecrites a la francaise', () => {
		const built = impactOption([{ label: 'Oui', raw: 0.305, weighted: 0.28 }]);
		const [raw, weighted] = series(built.option);

		expect(raw?.name).toBe('Brut');
		// Intl separe le signe par une espace fine insecable : \s la reconnait.
		expect((weighted?.data[0]?.label as { formatter: string }).formatter).toMatch(/^28,0\s%$/);
	});

	it('garde les couleurs du role, jamais du rang', () => {
		expect(RAW_COLOR).toBe('#1f6fb0');
		expect(WEIGHTED_COLOR).toBe('#FF5757');
	});
});

describe('histogramme des poids', () => {
	const bins = [
		{ from: 0, to: 0.5, count: 3 },
		{ from: 0.5, to: 1, count: 1 }
	];

	it('ecrit les classes a la francaise', () => {
		expect(binLabel(bins[0]!)).toBe('0 à 0,5');
	});

	it('compte les repondants par classe', () => {
		const [serie] = series(weightHistogramOption(bins).option);
		expect(serie?.data.map((point) => point.value)).toEqual([3, 1]);
	});

	it('donne le meme tableau que le graphique, avec les parts', () => {
		expect(histogramRows(bins, 4)).toEqual([
			{ label: '0 à 0,5', count: 3, share: 0.75 },
			{ label: '0,5 à 1', count: 1, share: 0.25 }
		]);
		expect(histogramRows(bins, 0)[0]?.share).toBeNull();
	});
});

describe('convergenceOption', () => {
	const history = [
		{ iteration: 1, maxDeviation: 0.08 },
		{ iteration: 2, maxDeviation: 0.004 },
		{ iteration: 3, maxDeviation: 0 }
	];
	const built = convergenceOption(history, 0.0001);

	it('passe en points et pose un zero au plancher de l echelle logarithmique', () => {
		const [line] = series(built.option);
		const values = line?.data.map((point) => point.value ?? 0) ?? [];
		expect(values[0]).toBeCloseTo(8, 10);
		expect(values[1]).toBeCloseTo(0.4, 10);
		expect(values[2]).toBe(1e-7);
	});

	it('etiquette seulement la premiere et la derniere iteration', () => {
		const [line] = series(built.option);
		const shown = line?.data.map((point) => (point.label as { show: boolean }).show);
		expect(shown).toEqual([true, false, true]);
	});

	it('trace le seuil epsilon', () => {
		const [line] = series(built.option) as (Serie & {
			markLine: { data: { yAxis: number }[]; label: { formatter: string } };
		})[];
		expect(line?.markLine.data[0]?.yAxis).toBeCloseTo(0.01, 12);
		expect(line?.markLine.label.formatter).toBe('seuil ε : 0,01 pt');
	});
});
