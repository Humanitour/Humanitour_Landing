import { describe, expect, it } from 'vitest';
import { NON_RESPONSE_KEY, type ModalityDescriptor } from '$shared/questions';
import type { AnswerRow } from './aggregate';
import { buildOutcome, buildPanels, type Axis } from './explore';
import { everyone } from './population';
import { panelsToCsv, resultToCsv, tableToCsv } from './result-csv';

const PRIORITE: readonly ModalityDescriptor[] = [
	{ key: 'pouvoir-achat', label: "Le pouvoir d'achat", isNonResponse: false },
	{ key: 'sante', label: 'La santé, l’hôpital', isNonResponse: false },
	{ key: NON_RESPONSE_KEY, label: 'Sans réponse', isNonResponse: true }
];

const REGION: readonly ModalityDescriptor[] = [
	{ key: 'bre', label: 'Bretagne', isNonResponse: false }
];

const ROWS: readonly AnswerRow[] = [
	{ responseId: 'r1', modalityKey: 'pouvoir-achat' },
	{ responseId: 'r2', modalityKey: 'pouvoir-achat' },
	{ responseId: 'r3', modalityKey: 'sante' },
	{ responseId: 'r4', modalityKey: NON_RESPONSE_KEY }
];

const X: Axis = { code: 'priorite', label: 'Priorité', modalities: PRIORITE, rows: ROWS };
const Y: Axis = {
	code: 'region',
	label: 'Région',
	modalities: REGION,
	rows: ROWS.map((row) => ({ responseId: row.responseId, modalityKey: 'bre' }))
};

/** Le CSV sans son BOM, decoupe en lignes. */
function linesOf(csv: string): string[] {
	return csv
		.replace(/^\uFEFF/, '')
		.trimEnd()
		.split('\r\n');
}

function csvFor(y: Axis | null, threshold = 1): string {
	return resultToCsv(
		buildOutcome({
			x: X,
			y,
			population: everyone(4),
			threshold,
			includeNonResponses: true
		})
	);
}

describe('export du resultat affiche', () => {
	it('commence par un BOM, pour qu un tableur garde les accents', () => {
		expect(csvFor(null).startsWith('﻿')).toBe(true);
	});

	it('nomme ses colonnes et compte une ligne par modalite', () => {
		const lines = linesOf(csvFor(null));

		expect(lines[0]).toBe('modalite,libelle,non_reponse,effectif,part,masque');
		expect(lines).toHaveLength(4);
	});

	it('sort la part en nombre relisible par un tableur', () => {
		const lines = linesOf(csvFor(null));
		const pouvoirAchat = lines.find((row) => row.startsWith('pouvoir-achat'));

		expect(pouvoirAchat).toContain('0.5000');
	});

	it('marque la non-reponse au lieu de l effacer', () => {
		const lines = linesOf(csvFor(null));
		const nonResponse = lines.find((row) => row.startsWith(NON_RESPONSE_KEY));

		expect(nonResponse).toContain('oui');
	});

	it('echappe un libelle contenant une virgule', () => {
		expect(csvFor(null)).toContain('"La santé, l’hôpital"');
	});

	it('sort une case masquee vide et signalee, jamais a zero', () => {
		// Seuil a 3 : « sante » (1 repondant) et la non-reponse (1) sont masquees.
		const lines = linesOf(csvFor(null, 3));
		const sante = lines.find((row) => row.startsWith('sante'));

		expect(sante).toContain(',,');
		expect(sante?.endsWith('oui')).toBe(true);
	});

	it('deplie le croisement en une ligne par case', () => {
		const lines = linesOf(csvFor(Y));

		expect(lines[0]).toBe('x,libelle_x,y,libelle_y,effectif,part_ligne,masque');
		// Trois modalites en X, une seule en Y.
		expect(lines).toHaveLength(4);
	});

	it('rend les seuls en-tetes quand la population est sous le seuil', () => {
		const csv = resultToCsv(
			buildOutcome({
				x: X,
				y: null,
				population: everyone(4),
				threshold: 50,
				includeNonResponses: true
			})
		);

		expect(linesOf(csv)).toHaveLength(1);
	});
});

/**
 * Decoupage en petits multiples. Deux sous-populations de deux repondants, dont
 * l une porte un libelle a virgule : c est le cas ou l echappement compte, la
 * colonne `panneau` etant la premiere de chaque ligne.
 */
const GENRE: Axis = {
	code: 'genre',
	label: 'Genre',
	modalities: [
		{ key: 'f', label: 'Femme', isNonResponse: false },
		{ key: 'h', label: 'Homme, ou autre', isNonResponse: false }
	],
	rows: [
		{ responseId: 'r1', modalityKey: 'f' },
		{ responseId: 'r3', modalityKey: 'f' },
		{ responseId: 'r2', modalityKey: 'h' },
		{ responseId: 'r4', modalityKey: 'h' }
	]
};

function panelsCsv(threshold: number): string {
	return panelsToCsv(
		buildPanels(
			{ x: X, y: null, population: everyone(4), threshold, includeNonResponses: true },
			GENRE
		)
	);
}

describe('export en petits multiples', () => {
	it('garde le BOM et les fins de ligne du tableur', () => {
		const csv = panelsCsv(1);

		expect(csv.startsWith('\uFEFF')).toBe(true);
		expect(csv.endsWith('\r\n')).toBe(true);
	});

	it('ajoute une colonne panneau en tete de l en-tete ordinaire', () => {
		expect(linesOf(panelsCsv(1))[0]).toBe(
			'panneau,modalite,libelle,non_reponse,effectif,part,masque'
		);
	});

	it('prefixe chaque ligne du libelle de son panneau', () => {
		const lines = linesOf(panelsCsv(1)).slice(1);

		expect(lines.filter((row) => row.startsWith('Femme,'))).toHaveLength(3);
	});

	it('echappe un libelle de panneau contenant une virgule', () => {
		const lines = linesOf(panelsCsv(1)).slice(1);

		expect(lines.filter((row) => row.startsWith('"Homme, ou autre",'))).toHaveLength(3);
	});

	it('reste plat : une seule ligne d en-tete pour tous les panneaux', () => {
		const lines = linesOf(panelsCsv(1));

		expect(lines.filter((row) => row.startsWith('panneau,'))).toHaveLength(1);
	});

	it('ne publie aucune ligne pour un panneau sous le seuil', () => {
		// Seuil a 3 : chaque panneau n a que deux repondants, rien ne sort.
		const lines = linesOf(panelsCsv(3));

		expect(lines).toHaveLength(1);
		expect(lines[0]).toBe('panneau,modalite,libelle,effectif,part,masque');
	});

	it('rend un en-tete seul quand il n y a aucun panneau', () => {
		expect(linesOf(panelsToCsv([]))).toEqual(['panneau']);
	});
});

describe('export en tableau', () => {
	it('met une variable en ligne, l autre en colonne, en % de la ligne', () => {
		const outcome = buildOutcome({
			x: Y,
			y: X,
			population: everyone(4),
			threshold: 1,
			includeNonResponses: false
		});
		const lines = linesOf(tableToCsv(outcome, null, 'Région × Priorité'));

		expect(lines[0]).toBe(
			`Région × Priorité (% en ligne – données brutes),Le pouvoir d'achat,"La santé, l’hôpital",Effectif`
		);
		expect(lines[1]).toBe('Bretagne,66.7,33.3,3');
		expect(lines[2]).toBe('Ensemble,66.7,33.3,3');
	});
});
