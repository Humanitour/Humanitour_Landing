import { describe, expect, it } from 'vitest';
import { composeWeightingNote, type WeightingNoteInput } from '../survey/weighting-note';
import { renderWeightingNotePdf } from './weighting-note';

const INPUT: WeightingNoteInput = {
	survey: { slug: 'essai', title: 'Enquête d’essai' },
	version: 2,
	computedAt: new Date('2026-10-08T12:00:00Z'),
	fieldworkStart: null,
	fieldworkEnd: null,
	source: null,
	respondents: 1200,
	settings: { tolerance: 0.0001, maxIterations: 100, trim: true, minWeight: 0.2, maxWeight: 3.7 },
	convergence: { converged: true, iterations: 12, maxDeviation: 0.00005 },
	metrics: {
		effectiveSampleSize: 980,
		designEffect: 1.22,
		coefficientOfVariation: 0.47,
		minWeight: 0.2,
		maxWeight: 3.7,
		weightRatio: 18.5,
		atBounds: 4
	},
	alertThreshold: 1.5,
	pcsTable: null,
	variables: [
		{
			code: 'region',
			label: 'Région',
			origin: null,
			missing: 2,
			// Assez de lignes pour que le tableau passe sur une seconde page.
			rows: Array.from({ length: 60 }, (_, index) => ({
				key: `r${index}`,
				label: `Région numéro ${index + 1}, au libellé assez long pour tenir sur deux lignes`,
				observed: 1 / 60,
				target: index === 0 ? 0.05 : 1 / 60,
				weighted: 1 / 60
			}))
		}
	]
};

function pageCount(pdf: Uint8Array): number {
	return (
		Buffer.from(pdf)
			.toString('latin1')
			.match(/\/Type \/Page\b/g)?.length ?? 0
	);
}

describe('renderWeightingNotePdf', () => {
	it('produces a complete PDF document', async () => {
		const pdf = await renderWeightingNotePdf(composeWeightingNote(INPUT));
		const raw = Buffer.from(pdf).toString('latin1');
		expect(raw.startsWith('%PDF-')).toBe(true);
		expect(raw.trimEnd().endsWith('%%EOF')).toBe(true);
	});

	it('carries the title and the language in its metadata', async () => {
		const raw = Buffer.from(await renderWeightingNotePdf(composeWeightingNote(INPUT))).toString(
			'latin1'
		);
		expect(raw).toContain('/Lang (fr-FR)');
		expect(raw).toMatch(/\/Title \d+ 0 R/);
		expect(raw).toMatch(/\/Author \d+ 0 R/);
	});

	it('embeds the brand fonts instead of falling back to a standard one', async () => {
		const raw = Buffer.from(await renderWeightingNotePdf(composeWeightingNote(INPUT))).toString(
			'latin1'
		);
		expect(raw).toMatch(/BowlbyOne/);
		expect(raw).toMatch(/Jost/);
		expect(raw).toMatch(/JetBrainsMono/);
		expect(raw).not.toMatch(/\/BaseFont \/Helvetica/);
	});

	it('breaks a long margin table across pages', async () => {
		const short = await renderWeightingNotePdf(
			composeWeightingNote({ ...INPUT, variables: [{ ...INPUT.variables[0]!, rows: [] }] })
		);
		const long = await renderWeightingNotePdf(composeWeightingNote(INPUT));
		expect(pageCount(long)).toBeGreaterThan(pageCount(short));
	});
});
