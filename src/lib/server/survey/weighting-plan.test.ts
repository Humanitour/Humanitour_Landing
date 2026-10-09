import { describe, expect, it } from 'vitest';
import { NON_RESPONSE_KEY } from '$lib/shared/questions';
import { rake } from './weighting';
import {
	buildUnits,
	canCalibrateOn,
	checkIntegrity,
	currentSettings,
	describeWeighting,
	integrityBlocker,
	originField,
	parseSettingsForm,
	readUsedVariables,
	roundPercentages,
	sameMargins,
	marginReport,
	parseTargetsForm,
	readDiagnostics,
	readVariables,
	targetField,
	toWeightingVariables,
	type CalibrationQuestion
} from './weighting-plan';

const SEXE: CalibrationQuestion = {
	code: 'sexe',
	label: 'Sexe',
	modalities: [
		{ key: 'f', label: 'Femme', isNonResponse: false },
		{ key: 'h', label: 'Homme', isNonResponse: false },
		{ key: NON_RESPONSE_KEY, label: 'Sans réponse', isNonResponse: true }
	]
};

const AGE: CalibrationQuestion = {
	code: 'age',
	label: 'Âge',
	modalities: [
		{ key: 'jeune', label: 'Moins de 35 ans', isNonResponse: false },
		{ key: 'vieux', label: '35 ans et plus', isNonResponse: false }
	]
};

function formWith(entries: Record<string, string | string[]>): FormData {
	const form = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		for (const item of Array.isArray(value) ? value : [value]) form.append(key, item);
	}
	return form;
}

describe('canCalibrateOn', () => {
	it('accepte une question a choix unique', () => {
		expect(canCalibrateOn('single_choice')).toBe(true);
	});

	it('refuse le choix multiple : une personne tomberait dans plusieurs cases', () => {
		expect(canCalibrateOn('multiple_choice')).toBe(false);
	});

	it('refuse un type inconnu', () => {
		expect(canCalibrateOn('inexistant')).toBe(false);
	});
});

describe('parseTargetsForm', () => {
	it('lit des pourcentages a virgule et les ecrit en parts', () => {
		const parsed = parseTargetsForm(
			formWith({
				variable: 'sexe',
				[targetField('sexe', 'f')]: '52,23',
				[targetField('sexe', 'h')]: '47,77 %'
			}),
			[SEXE, AGE]
		);

		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.variables).toHaveLength(1);
		const targets = parsed.variables[0]!.targets;
		expect(targets.f! + targets.h!).toBeCloseTo(1, 9);
		expect(targets.f).toBeCloseTo(0.5223, 9);
		expect(parsed.variables[0]!.origin).toBeUndefined();
	});

	it('refuse 99,9 % : la somme doit faire exactement 100 %', () => {
		const parsed = parseTargetsForm(
			formWith({
				variable: 'sexe',
				[targetField('sexe', 'f')]: '51,6',
				[targetField('sexe', 'h')]: '48,3'
			}),
			[SEXE]
		);

		expect(parsed.ok).toBe(false);
		if (parsed.ok) return;
		expect(parsed.message).toContain('99,9 %');
		expect(parsed.message).toContain('exactement 100 %');
	});

	it('accepte des tiers arrondis qui font 100 % a la decimale', () => {
		const parsed = parseTargetsForm(
			formWith({
				variable: 'age',
				[targetField('age', 'jeune')]: '33,33',
				[targetField('age', 'vieux')]: '66,67'
			}),
			[AGE]
		);

		expect(parsed.ok).toBe(true);
	});

	describe('provenance Insee', () => {
		const origin = {
			provider: 'insee-melodi',
			datasets: ['DS_RP_TD_POPULATION_AGESEX_PRINC'],
			period: '2023',
			geo: 'FRANCE-FM',
			dimension: 'sexe',
			fetchedAt: '2026-09-28T10:00:00.000Z',
			censusTargets: { f: 0.5223, h: 0.4777 }
		};

		function parseWith(f: string, h: string, raw: string) {
			const parsed = parseTargetsForm(
				formWith({
					variable: 'sexe',
					[targetField('sexe', 'f')]: f,
					[targetField('sexe', 'h')]: h,
					[originField('sexe')]: raw
				}),
				[SEXE]
			);
			return parsed.ok ? parsed.variables[0]!.origin : 'refuse';
		}

		it('garde la provenance d une marge reprise telle quelle', () => {
			expect(parseWith('52,23', '47,77', JSON.stringify(origin))).toEqual({
				...origin,
				edited: false
			});
		});

		it('marque retouchee une marge corrigee a la main', () => {
			const read = parseWith('52', '48', JSON.stringify(origin));
			expect(read !== 'refuse' && read?.edited).toBe(true);
		});

		it('ignore une provenance illisible ou incomplete', () => {
			expect(parseWith('52,23', '47,77', '{pas du json')).toBeUndefined();
			expect(parseWith('52,23', '47,77', JSON.stringify({ provider: 'autre' }))).toBeUndefined();
			expect(parseWith('52,23', '47,77', '')).toBeUndefined();
		});

		it('se relit depuis la colonne JSON', () => {
			const stored = [
				{ questionCode: 'sexe', targets: { f: 0.5, h: 0.5 }, origin: { ...origin, edited: true } }
			];
			expect(readVariables(stored)[0]?.origin?.edited).toBe(true);
		});
	});

	it('ignore une question non cochee, meme si ses cibles sont remplies', () => {
		const parsed = parseTargetsForm(
			formWith({
				variable: 'sexe',
				[targetField('sexe', 'f')]: '50',
				[targetField('sexe', 'h')]: '50',
				[targetField('age', 'jeune')]: '10'
			}),
			[SEXE, AGE]
		);

		expect(parsed.ok && parsed.variables.map((variable) => variable.questionCode)).toEqual([
			'sexe'
		]);
	});

	it('refuse une somme qui n est pas un arrondi, plutot que de normaliser en silence', () => {
		const parsed = parseTargetsForm(
			formWith({
				variable: 'age',
				[targetField('age', 'jeune')]: '30',
				[targetField('age', 'vieux')]: '57'
			}),
			[AGE]
		);

		expect(parsed.ok).toBe(false);
		if (parsed.ok) return;
		expect(parsed.message).toContain('87 %');
	});

	it('refuse une valeur qui n est pas un pourcentage', () => {
		const parsed = parseTargetsForm(
			formWith({
				variable: 'age',
				[targetField('age', 'jeune')]: 'beaucoup',
				[targetField('age', 'vieux')]: '50'
			}),
			[AGE]
		);

		expect(parsed.ok).toBe(false);
	});

	it('exige au moins une variable', () => {
		expect(parseTargetsForm(formWith({}), [SEXE]).ok).toBe(false);
	});

	it('ne propose jamais de cible pour la non-reponse', () => {
		const parsed = parseTargetsForm(
			formWith({
				variable: 'sexe',
				[targetField('sexe', 'f')]: '50',
				[targetField('sexe', 'h')]: '50',
				[targetField('sexe', NON_RESPONSE_KEY)]: '20'
			}),
			[SEXE]
		);

		expect(parsed.ok && Object.keys(parsed.variables[0]!.targets)).toEqual(['f', 'h']);
	});
});

describe('roundPercentages', () => {
	it('fait tomber trois tiers juste sur 100', () => {
		const rounded = roundPercentages([1, 1, 1]);

		expect(rounded).toEqual([33.34, 33.33, 33.33]);
		expect(rounded.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 10);
	});

	it('donne les centiemes manquants aux plus forts restes', () => {
		expect(roundPercentages([0.52226, 0.47774])).toEqual([52.23, 47.77]);
	});

	it('rend des zeros pour une somme nulle', () => {
		expect(roundPercentages([0, 0])).toEqual([0, 0]);
	});
});

describe('readUsedVariables et sameMargins', () => {
	const sexe = { questionCode: 'sexe', targets: { f: 0.52, h: 0.48 } };

	it('lit les marges enregistrees avec le diagnostic', () => {
		expect(readUsedVariables({ iterations: 1, variables: [sexe] })).toEqual([sexe]);
		expect(readUsedVariables({ iterations: 1 })).toBeNull();
		expect(readUsedVariables(null)).toBeNull();
	});

	it('reconnait des marges identiques, provenance mise a part', () => {
		expect(sameMargins([sexe], [{ ...sexe, targets: { h: 0.48, f: 0.52 } }])).toBe(true);
	});

	it('voit une cible modifiee, une variable ajoutee ou remplacee', () => {
		expect(sameMargins([sexe], [{ ...sexe, targets: { f: 0.5, h: 0.5 } }])).toBe(false);
		expect(sameMargins([sexe], [sexe, { questionCode: 'age', targets: { a: 1 } }])).toBe(false);
		expect(sameMargins([sexe], [{ questionCode: 'age', targets: sexe.targets }])).toBe(false);
	});
});

describe('parseSettingsForm', () => {
	const valid = {
		tolerance: '0,0001',
		maxIterations: '100',
		trim: 'on',
		minWeight: '0,25',
		maxWeight: '3.5'
	};

	it('lit les parametres, virgule ou point', () => {
		expect(parseSettingsForm(formWith({ ...valid, acceptMissing: 'on' }))).toEqual({
			ok: true,
			settings: {
				tolerance: 0.0001,
				maxIterations: 100,
				trim: true,
				minWeight: 0.25,
				maxWeight: 3.5
			},
			missingAcknowledged: true
		});
	});

	it('n exige pas de bornes sans troncature, et garde les bornes par defaut', () => {
		const parsed = parseSettingsForm(
			formWith({ tolerance: '0.001', maxIterations: '20', minWeight: '', maxWeight: 'x' })
		);

		expect(parsed).toEqual({
			ok: true,
			settings: {
				tolerance: 0.001,
				maxIterations: 20,
				trim: false,
				minWeight: 0.25,
				maxWeight: 3.5
			},
			missingAcknowledged: false
		});
	});

	it.each([
		[{ tolerance: '0' }, /convergence/],
		[{ tolerance: 'vite' }, /convergence/],
		[{ maxIterations: '2,5' }, /entier/],
		[{ maxIterations: '5000' }, /entier/],
		[{ minWeight: '2' }, /Bornes/],
		[{ maxWeight: '' }, /Bornes/]
	])('refuse %o', (override, message) => {
		const parsed = parseSettingsForm(formWith({ ...valid, ...override }));

		expect(parsed.ok).toBe(false);
		expect(!parsed.ok && parsed.message).toMatch(message);
	});
});

describe('currentSettings', () => {
	it('reprend les parametres du dernier calcul', () => {
		const settings = {
			tolerance: 0.001,
			maxIterations: 7,
			trim: false,
			minWeight: 0.3,
			maxWeight: 4
		};
		const diagnostics = readDiagnostics({
			iterations: 1,
			converged: true,
			maxDeviation: 0,
			minWeight: 1,
			maxWeight: 1,
			effectiveSampleSize: 1,
			respondents: 1,
			warnings: [],
			settings
		});

		expect(currentSettings(diagnostics, { minWeight: 0.2, maxWeight: 5 })).toEqual(settings);
	});

	it('retombe sur les defauts et les bornes enregistrees', () => {
		expect(currentSettings(null, { minWeight: 0.2, maxWeight: 5 })).toEqual({
			tolerance: 0.0001,
			maxIterations: 100,
			trim: true,
			minWeight: 0.2,
			maxWeight: 5
		});
		expect(currentSettings(null, null).maxWeight).toBe(3.5);
	});
});

describe('checkIntegrity et integrityBlocker', () => {
	const units = buildUnits(
		['a', 'b', 'c', 'd'],
		[
			{ responseId: 'a', questionCode: 'sexe', modalityKey: 'f' },
			{ responseId: 'b', questionCode: 'sexe', modalityKey: 'h' },
			{ responseId: 'c', questionCode: 'sexe', modalityKey: 'h' },
			{ responseId: 'a', questionCode: 'age', modalityKey: 'jeune' },
			{ responseId: 'b', questionCode: 'age', modalityKey: 'vieux' },
			{ responseId: 'c', questionCode: 'age', modalityKey: 'vieux' },
			{ responseId: 'd', questionCode: 'age', modalityKey: 'vieux' }
		]
	);

	it('compte les valeurs manquantes par variable', () => {
		const reports = checkIntegrity(
			units,
			[
				{ questionCode: 'sexe', targets: { f: 0.5, h: 0.5 } },
				{ questionCode: 'age', targets: { jeune: 0.4, vieux: 0.6 } }
			],
			[SEXE, AGE]
		);

		expect(reports).toEqual([
			{ questionCode: 'sexe', label: 'Sexe', missing: 1, untargeted: [] },
			{ questionCode: 'age', label: 'Âge', missing: 0, untargeted: [] }
		]);
	});

	it('releve une modalite portee par des repondants mais sans cible', () => {
		const reports = checkIntegrity(units, [{ questionCode: 'age', targets: { vieux: 1 } }], [AGE]);

		expect(reports[0]?.untargeted).toEqual([{ key: 'jeune', label: 'Moins de 35 ans', count: 1 }]);
		expect(integrityBlocker(reports, true)).toMatch(/« Moins de 35 ans » \(1\)/);
	});

	it('retombe sur les codes quand la question a disparu', () => {
		const reports = checkIntegrity(units, [{ questionCode: 'age', targets: { vieux: 1 } }], []);

		expect(reports[0]?.label).toBe('age');
		expect(reports[0]?.untargeted[0]?.label).toBe('jeune');
	});

	it('bloque des valeurs manquantes tant qu elles ne sont pas constatees', () => {
		const reports = checkIntegrity(
			units,
			[{ questionCode: 'sexe', targets: { f: 0.5, h: 0.5 } }],
			[SEXE]
		);

		expect(integrityBlocker(reports, false)).toMatch(/Valeurs manquantes sur « Sexe » \(1\)/);
		expect(integrityBlocker(reports, true)).toBeNull();
	});

	it('laisse passer des variables completes et ciblees', () => {
		const reports = checkIntegrity(
			units,
			[{ questionCode: 'age', targets: { jeune: 0.4, vieux: 0.6 } }],
			[AGE]
		);

		expect(integrityBlocker(reports, false)).toBeNull();
	});
});

describe('buildUnits', () => {
	it('garde les repondants sans reponse, sans modalite pour la variable', () => {
		const units = buildUnits(
			['a', 'b'],
			[{ responseId: 'a', questionCode: 'sexe', modalityKey: 'f' }]
		);

		expect(units).toHaveLength(2);
		expect(units.find((unit) => unit.id === 'b')?.modalities.size).toBe(0);
	});

	it('ne range pas la non-reponse dans une case de calage', () => {
		const units = buildUnits(
			['a'],
			[{ responseId: 'a', questionCode: 'sexe', modalityKey: NON_RESPONSE_KEY }]
		);

		expect(units[0]?.modalities.has('sexe')).toBe(false);
	});
});

describe('un calage de bout en bout', () => {
	it('rejoint la cible, et le rapport le montre modalite par modalite', () => {
		// Echantillon a 75 % de femmes, population a 50 %.
		const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
		const answers = ids.map((id, index) => ({
			responseId: id,
			questionCode: 'sexe',
			modalityKey: index < 6 ? 'f' : 'h'
		}));
		const units = buildUnits(ids, answers);
		const stored = [{ questionCode: 'sexe', targets: { f: 0.5, h: 0.5 } }];

		const { weights } = rake(units, toWeightingVariables(stored), { maxWeight: 10 });
		const { rows } = marginReport(units, weights, 'sexe', SEXE.modalities, stored[0]!.targets);

		const femmes = rows.find((row) => row.key === 'f');
		expect(femmes?.observed).toBeCloseTo(0.75, 6);
		expect(femmes?.target).toBe(0.5);
		expect(femmes?.weighted).toBeCloseTo(0.5, 3);
	});
});

describe('lecture des colonnes JSON', () => {
	it('rend une liste vide pour un contenu illisible', () => {
		expect(readVariables({ nimporte: 'quoi' })).toEqual([]);
	});

	it('rend null pour un diagnostic absent', () => {
		expect(readDiagnostics(null)).toBeNull();
	});

	it('relit un diagnostic ancien en deduisant l effet de plan et le rapport des poids', () => {
		const old = readDiagnostics({
			iterations: 8,
			converged: true,
			maxDeviation: 0.0002,
			minWeight: 0.5,
			maxWeight: 2,
			effectiveSampleSize: 800,
			respondents: 1000,
			warnings: []
		});

		expect(old?.designEffect).toBeCloseTo(1.25, 10);
		expect(old?.coefficientOfVariation).toBeCloseTo(0.5, 10);
		expect(old?.weightRatio).toBe(4);
		expect(old?.history).toEqual([]);
		expect(old?.settings).toBeNull();
	});

	it('ne divise pas par zero sur un ancien diagnostic vide', () => {
		const old = readDiagnostics({
			iterations: 0,
			converged: true,
			maxDeviation: 0,
			minWeight: 0,
			maxWeight: 0,
			effectiveSampleSize: 0,
			respondents: 0,
			warnings: []
		});

		expect(old?.designEffect).toBe(1);
		expect(old?.weightRatio).toBeNull();
	});
});

describe('marginReport', () => {
	const units = buildUnits(
		['a', 'b', 'c', 'd'],
		[
			{ responseId: 'a', questionCode: 'sexe', modalityKey: 'f' },
			{ responseId: 'b', questionCode: 'sexe', modalityKey: 'f' },
			{ responseId: 'c', questionCode: 'sexe', modalityKey: 'h' }
		]
	);

	it('compte a part les repondants sans modalite, sans les meler aux parts', () => {
		const { rows, unknown } = marginReport(units, null, 'sexe', SEXE.modalities, null);

		expect(unknown).toBe(1);
		// Trois repondants classes, pas quatre : deux femmes sur trois.
		expect(rows.find((row) => row.key === 'f')?.observed).toBeCloseTo(2 / 3, 6);
	});

	it('ne donne aucune part redressee tant qu il n y a pas de poids', () => {
		const { rows } = marginReport(units, null, 'sexe', SEXE.modalities, null);

		expect(rows.every((row) => row.weighted === null)).toBe(true);
	});

	it('ne donne aucune cible quand elle n est pas fixee', () => {
		const { rows } = marginReport(units, null, 'sexe', SEXE.modalities, null);

		expect(rows.every((row) => row.target === null)).toBe(true);
	});

	it('ne rend pas de part observee quand personne n est classe', () => {
		const vides = buildUnits(['a'], []);
		const { rows, unknown } = marginReport(vides, null, 'sexe', SEXE.modalities, null);

		expect(unknown).toBe(1);
		expect(rows.every((row) => row.observed === null)).toBe(true);
	});

	it('n inscrit pas la non-reponse parmi les lignes de calage', () => {
		const { rows } = marginReport(units, null, 'sexe', SEXE.modalities, null);

		expect(rows.map((row) => row.key)).not.toContain(NON_RESPONSE_KEY);
	});

	describe('avec un seuil d anonymat', () => {
		// Huit femmes, deux hommes : la part des hommes repose sur deux personnes.
		const people = Array.from({ length: 10 }, (_, index) => `p${index}`);
		const classed = buildUnits(
			people,
			people.map((id, index) => ({
				responseId: id,
				questionCode: 'sexe',
				modalityKey: index < 8 ? 'f' : 'h'
			}))
		);
		const weights = new Map(people.map((id) => [id, 1]));

		it('masque la part sous le seuil, et celle qui la redonnerait par soustraction', () => {
			const { rows } = marginReport(classed, weights, 'sexe', SEXE.modalities, { f: 0.5 }, 5);

			expect(rows.every((row) => row.observed === null && row.weighted === null)).toBe(true);
			// La cible vient du recensement, pas de l echantillon : elle reste publiee.
			expect(rows.find((row) => row.key === 'f')?.target).toBe(0.5);
		});

		it('publie toutes les parts quand chaque modalite passe le seuil', () => {
			const { rows } = marginReport(classed, weights, 'sexe', SEXE.modalities, null, 2);

			expect(rows.find((row) => row.key === 'h')?.observed).toBeCloseTo(0.2);
			expect(rows.find((row) => row.key === 'h')?.weighted).toBeCloseTo(0.2);
		});
	});
});

describe('describeWeighting', () => {
	const computedAt = new Date('2026-09-20T10:00:00.000Z');
	const diagnostics = {
		iterations: 12,
		converged: true,
		maxDeviation: 0.0004,
		minWeight: 0.61,
		maxWeight: 2.4,
		effectiveSampleSize: 712.5,
		designEffect: 985 / 712.5,
		coefficientOfVariation: Math.sqrt(985 / 712.5 - 1),
		weightRatio: 2.4 / 0.61,
		atBounds: 0,
		respondents: 985,
		warnings: [],
		history: [{ iteration: 1, maxDeviation: 0.0004 }],
		settings: null
	};

	it('rend les variables en libelles lisibles', () => {
		const description = describeWeighting(
			{
				version: 2,
				computedAt,
				source: 'INSEE, recensement 2021',
				variables: [{ questionCode: 'sexe', targets: { f: 0.52, h: 0.48 } }],
				diagnostics
			},
			[SEXE, AGE]
		);

		expect(description.variables).toEqual([
			{
				code: 'sexe',
				label: 'Sexe',
				targets: [
					{ key: 'f', label: 'Femme', share: 0.52 },
					{ key: 'h', label: 'Homme', share: 0.48 }
				]
			}
		]);
	});

	it('garde la version, la date et la source telles quelles', () => {
		const description = describeWeighting(
			{ version: 3, computedAt, source: null, variables: [], diagnostics: null },
			[SEXE]
		);

		expect(description.version).toBe(3);
		expect(description.computedAt).toBe(computedAt);
		expect(description.source).toBeNull();
	});

	it('retombe sur le code quand la question a disparu de l enquete', () => {
		const description = describeWeighting(
			{
				version: 1,
				computedAt,
				source: null,
				variables: [{ questionCode: 'retiree', targets: { x: 1 } }],
				diagnostics: null
			},
			[SEXE]
		);

		expect(description.variables[0]?.label).toBe('retiree');
		expect(description.variables[0]?.targets[0]?.label).toBe('x');
	});

	it('retombe sur la cle quand une modalite a disparu', () => {
		const description = describeWeighting(
			{
				version: 1,
				computedAt,
				source: null,
				variables: [{ questionCode: 'sexe', targets: { autre: 1 } }],
				diagnostics: null
			},
			[SEXE]
		);

		expect(description.variables[0]?.targets[0]?.label).toBe('autre');
	});

	it('publie les diagnostics sans le detail interne des iterations', () => {
		const description = describeWeighting(
			{ version: 1, computedAt, source: null, variables: [], diagnostics },
			[SEXE]
		);

		expect(description.diagnostics).toEqual({
			converged: true,
			maxDeviation: 0.0004,
			minWeight: 0.61,
			maxWeight: 2.4,
			effectiveSampleSize: 712.5,
			designEffect: 985 / 712.5,
			respondents: 985
		});
	});

	it('laisse les diagnostics absents quand il n y en a pas', () => {
		const description = describeWeighting(
			{ version: 1, computedAt, source: null, variables: [], diagnostics: null },
			[SEXE]
		);

		expect(description.diagnostics).toBeNull();
	});
});
