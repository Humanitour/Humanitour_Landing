import { describe, expect, it } from 'vitest';
import {
	clearFilter,
	countFilters,
	exploreSearch,
	filterValue,
	hasFilter,
	parseExploreParams,
	parseFilterValues,
	toggleFilter,
	type ExploreParams
} from './explore';

const BASE: ExploreParams = {
	x: 'priorite',
	y: null,
	z: null,
	chart: 'bars',
	includeNonResponses: false,
	filters: [],
	sort: null,
	basis: null,
	weighted: false
};

describe('parseExploreParams', () => {
	it('lit un croisement complet', () => {
		const params = parseExploreParams(new URLSearchParams('x=priorite&y=region&chart=stacked'));

		expect(params).toMatchObject({ x: 'priorite', y: 'region', chart: 'stacked' });
	});

	it('retire les non-reponses par defaut', () => {
		expect(parseExploreParams(new URLSearchParams('x=priorite')).includeNonResponses).toBe(false);
	});

	it('ne les inclut que sur la valeur exacte « 1 »', () => {
		expect(parseExploreParams(new URLSearchParams('nr=1')).includeNonResponses).toBe(true);
		expect(parseExploreParams(new URLSearchParams('nr=0')).includeNonResponses).toBe(false);
		expect(parseExploreParams(new URLSearchParams('nr=non')).includeNonResponses).toBe(false);
	});
});

describe('parseFilterValues', () => {
	it('regroupe deux modalites de la meme question en une clause', () => {
		expect(parseFilterValues(['region:bre', 'region:nor'])).toEqual([
			{ questionCode: 'region', modalityKeys: ['bre', 'nor'] }
		]);
	});

	it('garde une clause par question, dans l ordre d apparition', () => {
		expect(parseFilterValues(['region:bre', 'age:18-24'])).toEqual([
			{ questionCode: 'region', modalityKeys: ['bre'] },
			{ questionCode: 'age', modalityKeys: ['18-24'] }
		]);
	});

	it('accepte la forme abregee tapee a la main', () => {
		expect(parseFilterValues(['region:bre,nor'])).toEqual([
			{ questionCode: 'region', modalityKeys: ['bre', 'nor'] }
		]);
	});

	it('ignore une valeur sans code de question exploitable', () => {
		expect(parseFilterValues([':bre', 'region', '', 'region:'])).toEqual([]);
	});

	it('ne compte pas deux fois la meme modalite', () => {
		expect(parseFilterValues(['region:bre', 'region:bre'])).toEqual([
			{ questionCode: 'region', modalityKeys: ['bre'] }
		]);
	});

	it('conserve une cle de modalite contenant un tiret ou un chiffre', () => {
		expect(parseFilterValues(['age:18-24'])[0]?.modalityKeys).toEqual(['18-24']);
	});
});

describe('exploreSearch', () => {
	it('omet le croisement absent et la non-reponse retiree', () => {
		expect(exploreSearch(BASE)).toBe('x=priorite&chart=bars');
	});

	it('ecrit nr=1 quand la non-reponse est affichee', () => {
		expect(exploreSearch({ ...BASE, includeNonResponses: true })).toBe(
			'x=priorite&chart=bars&nr=1'
		);
	});

	it('emet un parametre filtre par modalite retenue', () => {
		const search = exploreSearch({
			...BASE,
			filters: [{ questionCode: 'region', modalityKeys: ['bre', 'nor'] }]
		});

		expect(search).toBe('x=priorite&chart=bars&filtre=region%3Abre&filtre=region%3Anor');
	});

	it('produit le meme lien quel que soit l ordre des clics', () => {
		const clickedFirst = toggleFilter(toggleFilter([], 'region', 'bre'), 'age', '18-24');
		const sameState = [
			{ questionCode: 'region', modalityKeys: ['bre'] },
			{ questionCode: 'age', modalityKeys: ['18-24'] }
		];

		expect(exploreSearch({ ...BASE, filters: clickedFirst })).toBe(
			exploreSearch({ ...BASE, filters: sameState })
		);
	});

	it('fait un aller-retour fidele avec la lecture', () => {
		const params: ExploreParams = {
			x: 'priorite',
			y: 'region',
			z: 'age',
			chart: 'crosstab',
			includeNonResponses: false,
			sort: 'effectif',
			basis: 'colonne',
			weighted: true,
			filters: [
				{ questionCode: 'region', modalityKeys: ['bre', 'nor'] },
				{ questionCode: 'age', modalityKeys: ['18-24'] }
			]
		};

		expect(parseExploreParams(new URLSearchParams(exploreSearch(params)))).toEqual(params);
	});
});

describe('lecture redressee', () => {
	it('est la lecture brute par defaut, et le lien ne l ecrit pas', () => {
		expect(parseExploreParams(new URLSearchParams('x=priorite')).weighted).toBe(false);
		expect(exploreSearch(BASE)).not.toContain('lecture=');
	});

	it('ne s active que sur la valeur exacte « redresse »', () => {
		expect(parseExploreParams(new URLSearchParams('lecture=redresse')).weighted).toBe(true);
		expect(parseExploreParams(new URLSearchParams('lecture=1')).weighted).toBe(false);
	});

	it('voyage dans le permalien', () => {
		expect(exploreSearch({ ...BASE, weighted: true })).toContain('lecture=redresse');
	});
});

describe('decoupage en petits multiples', () => {
	it('ne s ecrit pas tant qu aucune troisieme question n est demandee', () => {
		expect(exploreSearch(BASE)).not.toContain('z=');
	});

	it('se place juste apres le croisement, pour que le lien reste lisible', () => {
		const search = exploreSearch({ ...BASE, y: 'region', z: 'age' });

		expect(search.indexOf('y=')).toBeLessThan(search.indexOf('z='));
	});

	it('se relit tel quel', () => {
		expect(parseExploreParams(new URLSearchParams('x=a&y=b&z=c')).z).toBe('c');
	});
});

describe('lecture des cases', () => {
	it('ne s ecrit pas tant que la lecture par defaut suffit', () => {
		expect(exploreSearch(BASE)).not.toContain('base=');
	});

	it('s ecrit des que le visiteur change de lecture', () => {
		expect(exploreSearch({ ...BASE, basis: 'colonne' })).toContain('base=colonne');
	});

	it('ignore une lecture inconnue plutot que de casser le lien', () => {
		expect(parseExploreParams(new URLSearchParams('base=diagonale')).basis).toBeNull();
	});
});

describe('tri', () => {
	it('ne s ecrit pas dans l adresse tant que le visiteur n a pas tranche', () => {
		expect(exploreSearch(BASE)).not.toContain('tri=');
	});

	it('s ecrit des que le visiteur a choisi', () => {
		expect(exploreSearch({ ...BASE, sort: 'questionnaire' })).toContain('tri=questionnaire');
	});

	it('ignore une valeur de tri inconnue plutot que de casser le lien', () => {
		expect(parseExploreParams(new URLSearchParams('tri=nimporte-quoi')).sort).toBeNull();
	});

	it('relit les deux modes', () => {
		expect(parseExploreParams(new URLSearchParams('tri=effectif')).sort).toBe('effectif');
		expect(parseExploreParams(new URLSearchParams('tri=questionnaire')).sort).toBe('questionnaire');
	});
});

describe('toggleFilter', () => {
	it('ajoute une modalite sur une question encore libre', () => {
		expect(toggleFilter([], 'region', 'bre')).toEqual([
			{ questionCode: 'region', modalityKeys: ['bre'] }
		]);
	});

	it('ajoute une seconde modalite a la clause existante', () => {
		const filters = toggleFilter(
			[{ questionCode: 'region', modalityKeys: ['bre'] }],
			'region',
			'nor'
		);

		expect(filters).toEqual([{ questionCode: 'region', modalityKeys: ['bre', 'nor'] }]);
	});

	it('retire une modalite deja retenue', () => {
		const filters = toggleFilter(
			[{ questionCode: 'region', modalityKeys: ['bre', 'nor'] }],
			'region',
			'bre'
		);

		expect(filters).toEqual([{ questionCode: 'region', modalityKeys: ['nor'] }]);
	});

	it('supprime la clause videe de sa derniere modalite', () => {
		expect(
			toggleFilter([{ questionCode: 'region', modalityKeys: ['bre'] }], 'region', 'bre')
		).toEqual([]);
	});

	it('ne touche pas aux autres questions', () => {
		const filters = toggleFilter(
			[
				{ questionCode: 'region', modalityKeys: ['bre'] },
				{ questionCode: 'age', modalityKeys: ['18-24'] }
			],
			'region',
			'bre'
		);

		expect(filters).toEqual([{ questionCode: 'age', modalityKeys: ['18-24'] }]);
	});
});

describe('lecture des filtres', () => {
	const filters = [
		{ questionCode: 'region', modalityKeys: ['bre', 'nor'] },
		{ questionCode: 'age', modalityKeys: ['18-24'] }
	];

	it('reconnait une modalite retenue', () => {
		expect(hasFilter(filters, 'region', 'bre')).toBe(true);
		expect(hasFilter(filters, 'region', 'idf')).toBe(false);
		expect(hasFilter(filters, 'csp', 'bre')).toBe(false);
	});

	it('compte les modalites, pas les questions', () => {
		expect(countFilters(filters)).toBe(3);
		expect(countFilters([])).toBe(0);
	});

	it('vide une question entiere', () => {
		expect(clearFilter(filters, 'region')).toEqual([
			{ questionCode: 'age', modalityKeys: ['18-24'] }
		]);
	});

	it('compose une valeur de case a cocher', () => {
		expect(filterValue('region', 'bre')).toBe('region:bre');
	});
});
