import { describe, expect, it } from 'vitest';
import { NON_RESPONSE_KEY } from '$lib/shared/questions';
import {
	pageWindow,
	readFilter,
	responseCells,
	tallyQuestion,
	type BrowseAnswer,
	type BrowseQuestion
} from './browse';

const region: BrowseQuestion = {
	id: 'q1',
	code: 'region',
	label: 'Région',
	modalities: [
		{ key: 'bzh', label: 'Bretagne', isNonResponse: false },
		{ key: 'idf', label: 'Île-de-France', isNonResponse: false },
		{ key: 'nsp', label: 'Ne se prononce pas', isNonResponse: true }
	]
};

const medias: BrowseQuestion = {
	id: 'q2',
	code: 'medias',
	label: 'Médias',
	modalities: [
		{ key: 'tele', label: 'Télévision', isNonResponse: false },
		{ key: 'radio', label: 'Radio', isNonResponse: false }
	]
};

const age: BrowseQuestion = { id: 'q3', code: 'age', label: 'Âge', modalities: [] };

function answer(partial: Partial<BrowseAnswer> & { questionId: string; modalityKey: string }) {
	return { valueNumber: null, valueText: null, ...partial };
}

describe('responseCells', () => {
	it('rend le libelle de la modalite, une case par question', () => {
		const cells = responseCells(
			[region, medias],
			[
				answer({ questionId: 'q1', modalityKey: 'bzh' }),
				answer({ questionId: 'q2', modalityKey: 'tele' }),
				answer({ questionId: 'q2', modalityKey: 'radio' })
			]
		);

		expect(cells).toEqual([
			{ text: 'Bretagne', isNonResponse: false, missing: false },
			{ text: 'Télévision ; Radio', isNonResponse: false, missing: false }
		]);
	});

	it('prefere la valeur saisie a la tranche', () => {
		const [number, text] = responseCells(
			[age, { ...age, id: 'q4', code: 'avis' }],
			[
				answer({ questionId: 'q3', modalityKey: '28-37', valueNumber: 34 }),
				answer({ questionId: 'q4', modalityKey: 'answered', valueText: 'Le logement' })
			]
		);

		expect(number?.text).toBe('34');
		expect(text?.text).toBe('Le logement');
	});

	it('retombe sur la cle quand la modalite n est pas declaree', () => {
		const [cell] = responseCells([age], [answer({ questionId: 'q3', modalityKey: '28-37' })]);
		expect(cell?.text).toBe('28-37');
	});

	it('garde la non-reponse visible et la marque', () => {
		const [declared, implicit] = responseCells(
			[region, medias],
			[
				answer({ questionId: 'q1', modalityKey: 'nsp' }),
				answer({ questionId: 'q2', modalityKey: NON_RESPONSE_KEY })
			]
		);

		expect(declared).toEqual({ text: 'Ne se prononce pas', isNonResponse: true, missing: false });
		expect(implicit).toEqual({ text: 'Sans réponse', isNonResponse: true, missing: false });
	});

	it('distingue une question jamais vue d une non-reponse', () => {
		const [cell] = responseCells([region], []);
		expect(cell).toEqual({ text: '', isNonResponse: false, missing: true });
	});
});

describe('tallyQuestion', () => {
	it('compte chaque modalite declaree, zero compris, sur la base des repondants', () => {
		const tally = tallyQuestion(
			region,
			[
				{ responseId: 'r1', modalityKey: 'bzh' },
				{ responseId: 'r2', modalityKey: 'bzh' },
				{ responseId: 'r3', modalityKey: 'nsp' }
			],
			4
		);

		expect(tally.rows.map((row) => [row.key, row.count, row.share])).toEqual([
			['bzh', 2, 0.5],
			['idf', 0, 0],
			['nsp', 1, 0.25]
		]);
		expect(tally.missing).toBe(1);
	});

	it('ne compte qu une fois un repondant qui coche deux fois la meme case', () => {
		const tally = tallyQuestion(
			medias,
			[
				{ responseId: 'r1', modalityKey: 'tele' },
				{ responseId: 'r1', modalityKey: 'tele' },
				{ responseId: 'r1', modalityKey: 'radio' }
			],
			1
		);

		expect(tally.rows.map((row) => row.count)).toEqual([1, 1]);
		expect(tally.missing).toBe(0);
	});

	it('ajoute la non-reponse implicite seulement quand elle a ete donnee', () => {
		const without = tallyQuestion(medias, [{ responseId: 'r1', modalityKey: 'tele' }], 1);
		expect(without.rows.some((row) => row.key === NON_RESPONSE_KEY)).toBe(false);

		const withIt = tallyQuestion(medias, [{ responseId: 'r1', modalityKey: NON_RESPONSE_KEY }], 1);
		expect(withIt.rows.at(-1)).toMatchObject({
			key: NON_RESPONSE_KEY,
			label: 'Sans réponse',
			isNonResponse: true,
			count: 1
		});
	});

	it('garde la non-reponse declaree telle quelle', () => {
		const question = {
			...region,
			modalities: [
				...region.modalities,
				{ key: NON_RESPONSE_KEY, label: 'Refus', isNonResponse: true }
			]
		};
		const tally = tallyQuestion(question, [], 0);
		expect(tally.rows.at(-1)).toMatchObject({ key: NON_RESPONSE_KEY, label: 'Refus', share: 0 });
	});

	it('ajoute les modalites observees mais non declarees', () => {
		const tally = tallyQuestion(age, [{ responseId: 'r1', modalityKey: '18-27' }], 1);
		expect(tally.rows).toEqual([
			{ key: '18-27', label: '18-27', count: 1, share: 1, isNonResponse: false }
		]);
	});
});

describe('pageWindow', () => {
	it('borne la page demandee', () => {
		expect(pageWindow('2', 120, 50)).toEqual({ page: 2, pageCount: 3, skip: 50, take: 50 });
		expect(pageWindow('9', 120, 50).page).toBe(3);
		expect(pageWindow('0', 120, 50).page).toBe(1);
	});

	it('retombe sur la premiere page sans valeur lisible, meme sans reponse', () => {
		expect(pageWindow(null, 0, 50)).toEqual({ page: 1, pageCount: 1, skip: 0, take: 50 });
		expect(pageWindow('abc', 10, 50).page).toBe(1);
	});
});

describe('readFilter', () => {
	it('resout la question et le libelle de la modalite', () => {
		expect(readFilter([region], 'region', 'bzh')).toEqual({
			questionId: 'q1',
			questionCode: 'region',
			questionLabel: 'Région',
			modalityKey: 'bzh',
			modalityLabel: 'Bretagne'
		});
	});

	it('accepte une modalite non declaree, et nomme la non-reponse', () => {
		expect(readFilter([age], 'age', '18-27')?.modalityLabel).toBe('18-27');
		expect(readFilter([medias], 'medias', NON_RESPONSE_KEY)?.modalityLabel).toBe('Sans réponse');
	});

	it('annule le filtre incomplet ou sur une question inconnue', () => {
		expect(readFilter([region], null, 'bzh')).toBeNull();
		expect(readFilter([region], 'region', null)).toBeNull();
		expect(readFilter([region], 'inconnue', 'bzh')).toBeNull();
	});
});
