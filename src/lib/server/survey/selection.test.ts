import { describe, expect, it } from 'vitest';
import { parseExploreParams } from '$lib/shared/explore';
import type { ModalityDescriptor } from '$lib/shared/questions';
import {
	cardSearch,
	COMMENT_MAX,
	describeCards,
	filterChoices,
	parseCardForm,
	readCardFilters,
	TITLE_MAX,
	type SelectionQuestion,
	type StoredCard
} from './selection';

function modality(key: string, label: string): ModalityDescriptor {
	return { key, label, isNonResponse: false, color: null };
}

const QUESTIONS: SelectionQuestion[] = [
	{ code: 'sujet', label: 'Quel sujet ?', modalities: [modality('achat', "Pouvoir d'achat")] },
	{ code: 'region', label: 'Région', modalities: [modality('bre', 'Bretagne')] },
	{ code: 'age', label: 'Âge', modalities: [modality('18-24', '18-24 ans')] }
];

function form(entries: readonly (readonly [string, string])[]): FormData {
	const data = new FormData();
	for (const [name, value] of entries) data.append(name, value);
	return data;
}

const VALID: [string, string][] = [
	['title', '  Le pouvoir d’achat selon la région  '],
	['comment', 'Un écart net entre l’ouest et le reste.'],
	['x', 'region'],
	['y', 'sujet'],
	['chart', 'stacked'],
	['filtre', 'age:18-24']
];

describe('readCardFilters', () => {
	it('lit les valeurs filtre', () => {
		expect(readCardFilters({ filtre: ['region:bre', 3] })).toEqual(['region:bre']);
	});

	it('rend une liste vide pour une colonne illisible', () => {
		expect(readCardFilters({})).toEqual([]);
		expect(readCardFilters(null)).toEqual([]);
		expect(readCardFilters('region:bre')).toEqual([]);
		expect(readCardFilters({ filtre: 'region:bre' })).toEqual([]);
	});
});

describe('parseCardForm', () => {
	it('valide une carte complete', () => {
		const parsed = parseCardForm(form(VALID), QUESTIONS);

		expect(parsed).toEqual({
			ok: true,
			value: {
				title: 'Le pouvoir d’achat selon la région',
				comment: 'Un écart net entre l’ouest et le reste.',
				chart: 'stacked',
				xCode: 'region',
				yCode: 'sujet',
				filters: { filtre: ['age:18-24'] }
			}
		});
	});

	it('accepte une question seule, sans commentaire ni filtre, et lui donne le graphique par defaut', () => {
		const parsed = parseCardForm(
			form([
				['title', 'Le sujet'],
				['x', 'sujet'],
				['y', ''],
				['chart', 'stacked'],
				['filtre', '']
			]),
			QUESTIONS
		);

		expect(parsed.ok && parsed.value).toMatchObject({
			comment: null,
			yCode: null,
			chart: 'bars',
			filters: { filtre: [] }
		});
	});

	it('ne garde qu un exemplaire d un filtre repete', () => {
		const parsed = parseCardForm(form([...VALID, ['filtre', 'age:18-24']]), QUESTIONS);
		expect(parsed.ok && parsed.value.filters.filtre).toEqual(['age:18-24']);
	});

	it.each([
		['un titre vide', [['title', '  ']], 'Donnez un titre'],
		['un titre trop long', [['title', 'x'.repeat(TITLE_MAX + 1)]], 'Le titre dépasse'],
		['un commentaire trop long', [['comment', 'x'.repeat(COMMENT_MAX + 1)]], 'Le commentaire'],
		['une question inconnue', [['x', 'inconnue']], 'Choisissez la question'],
		['un croisement sur la meme question', [['y', 'region']], 'autre question'],
		['un croisement inconnu', [['y', 'inconnue']], 'autre question'],
		['un filtre sur une modalite inconnue', [['filtre', 'age:99']], 'Un filtre'],
		['un filtre sans question', [['filtre', 'n-importe-quoi']], 'Un filtre'],
		['un filtre a deux modalites', [['filtre', 'region:bre,nor']], 'Un filtre'],
		['un filtre sur une question inconnue', [['filtre', 'inconnue:bre']], 'Un filtre']
	] as const)('refuse %s', (_, overrides, message) => {
		const entries = VALID.filter(([name]) => !overrides.some(([key]) => key === name));
		const parsed = parseCardForm(form([...entries, ...overrides]), QUESTIONS);

		expect(parsed.ok).toBe(false);
		expect(!parsed.ok && parsed.message).toContain(message);
	});

	it('refuse une carte sans question', () => {
		expect(parseCardForm(new FormData(), QUESTIONS).ok).toBe(false);
	});
});

const CARD: StoredCard = {
	id: 'c1',
	title: 'Le pouvoir d’achat selon la région',
	comment: null,
	chart: 'stacked',
	xCode: 'region',
	yCode: 'sujet',
	filters: { filtre: ['age:18-24'] }
};

describe('cardSearch', () => {
	it('produit un permalien que l explorateur relit a l identique', () => {
		const params = parseExploreParams(new URLSearchParams(cardSearch(CARD)));

		expect(params).toMatchObject({
			x: 'region',
			y: 'sujet',
			chart: 'stacked',
			includeNonResponses: true,
			weighted: false,
			filters: [{ questionCode: 'age', modalityKeys: ['18-24'] }]
		});
	});
});

describe('describeCards', () => {
	it('met les axes et les filtres en clair', () => {
		expect(describeCards([CARD], QUESTIONS)).toEqual([
			{
				id: 'c1',
				title: 'Le pouvoir d’achat selon la région',
				comment: null,
				question: 'Région',
				crossedWith: 'Quel sujet ?',
				filters: ['Âge : 18-24 ans'],
				search: cardSearch(CARD)
			}
		]);
	});

	it('accepte une carte sans croisement', () => {
		const [card] = describeCards([{ ...CARD, yCode: null, filters: {} }], QUESTIONS);
		expect(card?.crossedWith).toBeNull();
		expect(card?.filters).toEqual([]);
	});

	it('ecarte une carte dont une question ou une modalite a disparu', () => {
		const cards = describeCards(
			[
				{ ...CARD, id: 'x', xCode: 'disparue' },
				{ ...CARD, id: 'y', yCode: 'disparue' },
				{ ...CARD, id: 'f', filters: { filtre: ['age:99'] } },
				{ ...CARD, id: 'q', filters: { filtre: ['disparue:1'] } }
			],
			QUESTIONS
		);
		expect(cards).toEqual([]);
	});
});

describe('filterChoices', () => {
	it('propose chaque modalite de chaque question, au format des filtres', () => {
		expect(filterChoices(QUESTIONS)[1]).toEqual({
			label: 'Région',
			options: [{ value: 'region:bre', label: 'Bretagne' }]
		});
	});
});
