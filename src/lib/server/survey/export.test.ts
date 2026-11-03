import { describe, expect, it } from 'vitest';
import { NON_RESPONSE_KEY } from '$lib/shared/questions';
import {
	escapeCsv,
	exportableQuestions,
	toCsv,
	toJson,
	weightsCsv,
	type ExportableResponse
} from './export';
import type { PublicQuestion } from './queries';

function question(partial: Partial<PublicQuestion> & { code: string }): PublicQuestion {
	return {
		id: partial.code,
		code: partial.code,
		label: partial.label ?? partial.code,
		type: partial.type ?? 'single_choice',
		config: partial.config ?? {},
		isCrossable: partial.isCrossable ?? true,
		options: partial.options ?? []
	};
}

const PRIORITE = question({
	code: 'priorite',
	label: 'Quelle est votre priorite ?',
	options: [
		{ code: 'sante', label: 'La sante', position: 0, isNonResponse: false },
		{ code: 'ecologie', label: "L'ecologie", position: 1, isNonResponse: false }
	]
});

const AGE = question({
	code: 'age',
	type: 'number',
	config: { bucketSize: 10, bucketStart: 18 }
});

const VERBATIM = question({ code: 'verbatim', type: 'free_text', isCrossable: false });

function response(id: string, answers: Record<string, string | string[]>): ExportableResponse {
	return {
		id,
		collectedAt: new Date('2026-07-04T10:00:00Z'),
		answers: Object.entries(answers).flatMap(([questionCode, value]) =>
			(Array.isArray(value) ? value : [value]).map((modalityKey) => ({ questionCode, modalityKey }))
		)
	};
}

describe('exportableQuestions', () => {
	it('exclut les verbatims', () => {
		// Un verbatim identifie son auteur par son contenu : il ne sort pas, quelle
		// que soit la colonne ou il se trouve.
		const kept = exportableQuestions([PRIORITE, AGE, VERBATIM]).map((q) => q.code);

		expect(kept).toEqual(['priorite', 'age']);
	});
});

describe('escapeCsv', () => {
	it('laisse une valeur simple intacte', () => {
		expect(escapeCsv('sante')).toBe('sante');
	});

	it('protege une valeur contenant un separateur', () => {
		expect(escapeCsv('a,b')).toBe('"a,b"');
		expect(escapeCsv('a;b')).toBe('"a;b"');
	});

	it('double les guillemets internes', () => {
		expect(escapeCsv('il a dit "oui"')).toBe('"il a dit ""oui"""');
	});

	it('protege une valeur contenant un saut de ligne', () => {
		expect(escapeCsv('a\nb')).toBe('"a\nb"');
	});
});

describe('toCsv', () => {
	const responses = [
		response('r1', { priorite: 'sante', age: '28-37' }),
		response('r2', { priorite: NON_RESPONSE_KEY, age: '38-47' })
	];

	it('ecrit un en-tete avec les codes de question', () => {
		const csv = toCsv(responses, [PRIORITE, AGE]);
		const header = csv.split('\r\n')[0];

		expect(header).toContain('reponse_id');
		expect(header).toContain('date_collecte');
		expect(header).toContain('priorite');
	});

	it('commence par un BOM, sans quoi un tableur casse les accents', () => {
		expect(toCsv(responses, [PRIORITE]).startsWith('\uFEFF')).toBe(true);
	});

	it('ecrit le libelle de la modalite, pas son code', () => {
		const csv = toCsv(responses, [PRIORITE]);

		expect(csv).toContain('La sante');
	});

	it('nomme explicitement la non-reponse', () => {
		const csv = toCsv(responses, [PRIORITE]);

		expect(csv).toContain('Sans réponse');
	});

	it('exporte la tranche, jamais la valeur exacte', () => {
		// C'est la protection contre la reidentification : le seuil de k-anonymat
		// protege les agregats, pas un fichier ligne a ligne.
		const csv = toCsv(responses, [AGE]);

		expect(csv).toContain('28-37');
		expect(csv).not.toContain('34');
	});

	it('joint les modalites multiples par un point-virgule reimportable', () => {
		const csv = toCsv([response('r1', { priorite: ['sante', 'ecologie'] })], [PRIORITE]);

		expect(csv).toContain('"La sante;L\'ecologie"');
	});

	it('vaut « sans reponse » quand la question n a aucune ligne', () => {
		const csv = toCsv([response('r1', {})], [PRIORITE]);

		expect(csv).toContain('Sans réponse');
	});

	it('produit une ligne par reponse, en plus de l en-tete', () => {
		const lines = toCsv(responses, [PRIORITE]).trim().split('\r\n');

		expect(lines).toHaveLength(3);
	});
});

describe('toJson', () => {
	const survey = {
		slug: 'presidentielle-2027',
		title: 'Presidentielle 2027',
		methodology: 'Collecte en face-a-face.',
		fieldworkStart: new Date('2026-06-15'),
		fieldworkEnd: new Date('2026-08-20')
	};

	it('porte la methodologie avec les donnees', () => {
		const output = toJson(survey, [response('r1', { priorite: 'sante' })], [PRIORITE]);

		expect(output.survey.methodology).toBe('Collecte en face-a-face.');
	});

	it('annonce l absence de ponderation et la licence', () => {
		const output = toJson(survey, [], [PRIORITE]);

		expect(output.notice).toMatch(/sans pondération/i);
		expect(output.license).toMatch(/ODbL/);
	});

	it('declare les modalites, non-reponse comprise', () => {
		const output = toJson(survey, [], [PRIORITE]);
		const keys = output.questions[0]?.modalities.map((modality) => modality.key);

		expect(keys).toContain('sante');
		expect(keys).toContain(NON_RESPONSE_KEY);
	});

	it('indexe chaque reponse par code de question', () => {
		const output = toJson(survey, [response('r1', { priorite: 'sante' })], [PRIORITE]);

		expect(output.responses[0]?.priorite).toBe('La sante');
		expect(output.responses[0]?.reponse_id).toBe('r1');
	});

	it('supporte un sondage sans periode de terrain declaree', () => {
		const output = toJson({ ...survey, fieldworkStart: null, fieldworkEnd: null }, [], [PRIORITE]);

		expect(output.survey.fieldworkStart).toBeNull();
	});
});

describe('exportableQuestions, type inconnu', () => {
	it('ecarte une question dont le type n existe plus dans le registre', () => {
		// Un type retire du registre ne doit pas faire echouer l export : la
		// question en sort, le reste du fichier reste telechargeable.
		const orphan = question({ code: 'orpheline', type: 'type_supprime' });

		expect(exportableQuestions([PRIORITE, orphan]).map((q) => q.code)).toEqual(['priorite']);
	});
});

describe('weightsCsv', () => {
	const units = [
		{
			id: 'r1',
			modalities: new Map([
				['sexe', 'f'],
				['age', 'a18']
			])
		},
		{ id: 'r2', modalities: new Map([['sexe', 'h']]) },
		{ id: 'r3', modalities: new Map<string, string>() }
	];

	it('ecrit une ligne par repondant, codes de modalite et poids a six decimales', () => {
		const csv = weightsCsv(
			units,
			new Map([
				['r1', 1.23456789],
				['r2', 0.5]
			]),
			['sexe', 'age']
		);

		expect(csv.startsWith('﻿')).toBe(true);
		expect(csv.slice(1).split('\r\n')).toEqual([
			'reponse_id,sexe,age,poids',
			'r1,f,a18,1.234568',
			'r2,h,,0.500000',
			'r3,,,',
			''
		]);
	});
});

describe('poids de redressement', () => {
	const weighted = { ...response('r1', { priorite: 'sante' }), weight: 1.234567891 };

	it('n ajoute aucune colonne sans redressement publie', () => {
		const header = toCsv([weighted], [PRIORITE]).replace('\uFEFF', '').split('\r\n')[0];

		expect(header).toBe('reponse_id,date_collecte,priorite');
	});

	it('ajoute la colonne poids, juste apres la date, a six decimales', () => {
		const [header, row] = toCsv([weighted], [PRIORITE], { weighted: true })
			.replace('\uFEFF', '')
			.split('\r\n');

		expect(header).toBe('reponse_id,date_collecte,poids,priorite');
		expect(row?.split(',')[2]).toBe('1.234568');
	});

	it('porte le poids et l explique dans l export JSON', () => {
		const survey = {
			slug: 's',
			title: 'S',
			methodology: null,
			fieldworkStart: null,
			fieldworkEnd: null
		};
		const output = toJson(survey, [weighted], [PRIORITE], { weighted: true });

		expect(output.responses[0]?.poids).toBeCloseTo(1.234567891, 9);
		expect(output.notice).toMatch(/poids/);
	});
});
