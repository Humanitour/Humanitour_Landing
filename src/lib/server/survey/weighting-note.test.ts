import { describe, expect, it } from 'vitest';
import {
	composeWeightingNote,
	MARGIN_COLUMNS,
	type NoteBlock,
	type WeightingNote,
	type WeightingNoteInput
} from './weighting-note';

const INPUT: WeightingNoteInput = {
	survey: { slug: 'tour-de-france', title: 'Tour de France des opinions' },
	version: 7,
	computedAt: new Date('2026-10-08T12:00:00Z'),
	fieldworkStart: new Date('2026-07-01T00:00:00Z'),
	fieldworkEnd: new Date('2026-08-31T00:00:00Z'),
	source: 'Insee, recensement de la population 2022.',
	respondents: 1000,
	settings: { tolerance: 0.0001, maxIterations: 100, trim: true, minWeight: 0.2, maxWeight: 3.7 },
	convergence: { converged: true, iterations: 55, maxDeviation: 0.000099 },
	metrics: {
		effectiveSampleSize: 813.2,
		designEffect: 1.23,
		coefficientOfVariation: 0.479,
		minWeight: 0.2,
		maxWeight: 3.7,
		weightRatio: 18.5,
		atBounds: 16
	},
	alertThreshold: 1.5,
	anonymityThreshold: null,
	pcsTable: 'RP2022 PCS',
	variables: [
		{
			code: 'pcs',
			label: 'Catégorie socio-professionnelle',
			origin: { period: '2022', edited: true },
			missing: 0,
			rows: [
				{
					key: 'artisan',
					label: "Artisan, commerçant ou chef d'entreprise",
					observed: 0.089,
					target: 0.065,
					weighted: 0.065
				},
				{ key: 'autre', label: 'Autre', observed: 0, target: 0.0187, weighted: 0 },
				{ key: 'libre', label: 'Hors calage', observed: 0.1, target: null, weighted: 0.1 }
			]
		},
		{
			code: 'zone',
			label: "Zone d'habitation",
			origin: null,
			missing: 3,
			rows: [{ key: 'rural', label: 'Rural', observed: 0.197, target: 0.135, weighted: 0.135 }]
		},
		{
			code: 'sexe',
			label: 'Genre',
			origin: { period: '2022', edited: false },
			missing: 1,
			rows: [{ key: 'f', label: 'Femme', observed: 0.55, target: 0.52, weighted: 0.52 }]
		}
	]
};

function text(note: WeightingNote): string {
	return note.sections
		.flatMap((section) => section.blocks)
		.flatMap((block) => (block.kind === 'paragraph' ? block.runs.map((run) => run.text) : []))
		.join('');
}

function marginBlocks(note: WeightingNote): Extract<NoteBlock, { kind: 'margins' }>[] {
	return note.sections
		.flatMap((section) => section.blocks)
		.filter((block): block is Extract<NoteBlock, { kind: 'margins' }> => block.kind === 'margins');
}

function factsOf(note: WeightingNote): { label: string; value: string }[] {
	const block = note.sections
		.flatMap((section) => section.blocks)
		.find((item): item is Extract<NoteBlock, { kind: 'facts' }> => item.kind === 'facts');
	return [...(block?.rows ?? [])];
}

describe('composeWeightingNote', () => {
	it('names the document after the survey and the version', () => {
		const note = composeWeightingNote(INPUT);
		expect(note.version).toBe(7);
		expect(note.subject).toBe('Tour de France des opinions');
		expect(note.subtitle).toBe('Version 7 du redressement, calculée le 8 octobre 2026.');
		expect(note.fileName).toBe('redressement-tour-de-france-v7.pdf');
		expect(note.marginColumns).toBe(MARGIN_COLUMNS);
		expect(note.sections.map((section) => section.title)).toEqual([
			'1. Données',
			'2. Méthode',
			'3. Totaux marginaux de référence',
			'4. Qualité du redressement',
			'5. Limites'
		]);
	});

	// Le defaut qui a motive ce module : la cible lue pour l'echantillon brut.
	it('keeps the raw sample, the target and the weighted share in their own cells', () => {
		const [pcs] = marginBlocks(composeWeightingNote(INPUT));
		expect(MARGIN_COLUMNS).toEqual([
			'Échantillon brut',
			'Cible',
			'Échantillon redressé',
			'Écart à la cible'
		]);
		expect(pcs?.rows[0]).toMatchObject({
			observed: '8,9 %',
			target: '6,5 %',
			weighted: '6,5 %',
			deviation: '0,0 pt',
			far: false
		});
	});

	it('flags a margin left more than one point from its target', () => {
		const [pcs] = marginBlocks(composeWeightingNote(INPUT));
		expect(pcs?.rows[1]).toMatchObject({ deviation: '−1,9 pt', far: true });
	});

	it('leaves the deviation empty for a modality without target', () => {
		const [pcs] = marginBlocks(composeWeightingNote(INPUT));
		expect(pcs?.rows[2]).toMatchObject({ target: '—', deviation: '', far: false });
	});

	it('states where each set of targets comes from', () => {
		const [pcs, zone, sexe] = marginBlocks(composeWeightingNote(INPUT));
		expect(pcs?.provenance).toBe('recensement de la population 2022, cibles retouchées à la main');
		expect(zone?.provenance).toBe('cibles saisies à la main');
		expect(sexe?.provenance).toBe('recensement de la population 2022');
	});

	it('counts the respondents left out of a variable, in the singular and the plural', () => {
		const [pcs, zone, sexe] = marginBlocks(composeWeightingNote(INPUT));
		expect(pcs?.footnote).toBeNull();
		expect(zone?.footnote).toMatch(/^3 répondants sans réponse à cette question, conservés/);
		expect(sexe?.footnote).toMatch(/^1 répondant sans réponse à cette question, conservé avec/);
	});

	it('names each margin table after its calibration variable', () => {
		expect(marginBlocks(composeWeightingNote(INPUT)).map((block) => block.code)).toEqual([
			'pcs',
			'zone',
			'sexe'
		]);
	});

	describe('published with an anonymity threshold', () => {
		const masked: WeightingNoteInput = {
			...INPUT,
			anonymityThreshold: 5,
			variables: INPUT.variables.map((variable) =>
				variable.code === 'sexe'
					? { ...variable, rows: [{ ...variable.rows[0]!, observed: null, weighted: null }] }
					: variable
			)
		};

		it('hides a count of missing answers below the threshold', () => {
			const [, zone, sexe] = marginBlocks(composeWeightingNote(masked));
			expect(zone?.footnote).toMatch(/^Moins de 5 répondants sans réponse à cette question/);
			expect(sexe?.footnote).toMatch(/^Moins de 5 répondants/);
		});

		it('explains the dash that replaces a masked share', () => {
			const [sexe] = marginBlocks(composeWeightingNote(masked)).slice(-1);
			expect(sexe?.rows[0]).toMatchObject({ observed: '—', weighted: '—', deviation: '' });
			expect(text(composeWeightingNote(masked))).toContain(
				'Un tiret remplace les parts qui reposent sur moins de 5 répondants'
			);
		});

		it('says nothing about masking when no share is masked', () => {
			const note = composeWeightingNote({ ...INPUT, anonymityThreshold: 5 });
			expect(text(note)).not.toContain('Un tiret remplace');
		});

		it('keeps an exact count of missing answers at or above the threshold', () => {
			const [pcs] = marginBlocks(
				composeWeightingNote({
					...masked,
					variables: [{ ...INPUT.variables[0]!, missing: 12 }]
				})
			);
			expect(pcs?.footnote).toMatch(/^12 répondants sans réponse/);
		});
	});

	it('writes the calibration formula with its subscripts', () => {
		const method = composeWeightingNote(INPUT).sections[1]!;
		const formula = method.blocks[0]!;
		expect(formula.kind).toBe('paragraph');
		if (formula.kind !== 'paragraph') return;
		expect(formula.runs.filter((run) => run.style === 'sub').map((run) => run.text)).toEqual([
			'k',
			'k',
			'kj',
			'j'
		]);
		expect(formula.runs.find((run) => run.style === 'em')?.text).toBe('j');
	});

	it('describes the fieldwork, the stopping rule, the trimming and the convergence', () => {
		const body = text(composeWeightingNote(INPUT));
		expect(body).toContain('Terrain du 1 juillet 2026 au 31 août 2026.');
		expect(body).toContain('ε = 0,0001 (en part), dans la limite de 100 itérations.');
		expect(body).toContain("l'intervalle [0,2 ; 3,7]");
		expect(body).toContain('Le calage a convergé en 55 itérations');
		expect(body).toContain('Source des marges : Insee, recensement de la population 2022.');
		expect(body).toContain('le tableau RP2022 PCS du recensement');
	});

	it('says so when the weights were not trimmed', () => {
		const note = composeWeightingNote({
			...INPUT,
			settings: { ...INPUT.settings!, trim: false }
		});
		expect(text(note)).toContain("Aucune troncature n'a été appliquée aux poids.");
		expect(factsOf(note).map((row) => row.label)).not.toContain('Répondants à une borne');
	});

	it('skips the stopping rule for a computation saved before its settings', () => {
		const note = composeWeightingNote({ ...INPUT, settings: null });
		expect(note.sections[1]!.blocks).toHaveLength(2);
		expect(text(note)).not.toContain('Critère');
	});

	it('warns that margins must be read with the residual gap when the raking did not converge', () => {
		const body = text(
			composeWeightingNote({
				...INPUT,
				convergence: { converged: false, iterations: 100, maxDeviation: 0.0123 }
			})
		);
		expect(body).toContain("Le calage n'a pas convergé en 100 itérations");
		expect(body).toContain('1,23 point de pourcentage');
	});

	it('uses the singular for a single iteration', () => {
		const body = text(
			composeWeightingNote({
				...INPUT,
				convergence: { converged: true, iterations: 1, maxDeviation: 0 }
			})
		);
		expect(body).toContain('convergé en 1 itération ;');
	});

	it('handles a survey without fieldwork dates, source or socio-professional margins', () => {
		const note = composeWeightingNote({
			...INPUT,
			fieldworkStart: null,
			fieldworkEnd: null,
			source: null,
			pcsTable: null
		});
		const body = text(note);
		expect(body).not.toContain('Terrain');
		expect(body).toContain('Source des marges : non renseignée.');
		expect(body).not.toContain('groupe socioprofessionnel');
	});

	it('reports the quality indicators', () => {
		expect(factsOf(composeWeightingNote(INPUT))).toEqual([
			{ label: 'Taille effective (Kish)', value: '813 sur 1 000' },
			{ label: 'Effet de plan, Deff = 1 + CV(w)²', value: '1,23' },
			{ label: 'Coefficient de variation des poids', value: '0,479' },
			{ label: 'Poids minimal et maximal', value: '0,2 et 3,7' },
			{ label: 'Rapport w max / w min', value: '18,5' },
			{ label: 'Répondants à une borne', value: '16' }
		]);
	});

	it('alerts only above the design effect threshold', () => {
		expect(text(composeWeightingNote(INPUT))).not.toContain('Il dépasse');
		const alert = text(
			composeWeightingNote({ ...INPUT, metrics: { ...INPUT.metrics, designEffect: 1.8 } })
		);
		expect(alert).toContain('Il dépasse 1,5, seuil au-delà duquel');
	});
});
