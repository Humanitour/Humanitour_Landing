import { parseCellBasis, type CellBasis } from '$charts/crosstab-cell';
/**
 * Parametres de l explorateur de croisements.
 *
 * Ce fichier est LE contrat de permalien (AGENTS.md section 1.4). Un croisement
 * partage par un journaliste en 2026 doit s ouvrir a l identique en 2030 : on
 * ajoute des parametres, on n en renomme jamais, et on ne change jamais la
 * facon dont une valeur existante se lit.
 *
 * Il est isomorphe a dessein. Le serveur lit ces parametres, le client les
 * reecrit sans recharger la page, et les deux doivent produire la MEME adresse
 * pour le meme etat : sinon deux visiteurs partagent deux liens differents pour
 * le meme resultat, et le permalien ne veut plus rien dire.
 */

/** Question portee en abscisse. */
export const PARAM_X = 'x';
/** Question croisee. Absent = distribution simple. */
export const PARAM_Y = 'y';
/**
 * Troisieme question : le resultat est alors repete une fois par modalite.
 *
 * Trois variables ne tiennent pas dans un seul graphique sans mentir sur au
 * moins l une des trois. On decoupe donc en petits multiples : le meme
 * croisement, cote a cote, une fois par modalite de cette question.
 */
export const PARAM_Z = 'z';
// La lecture des cases est definie avec les graphiques, pas ici : c est une
// facon de LIRE un tableau, et le contrat de permalien ne fait que la
// transporter.
/** Cle du registre `src/lib/charts/`. */
export const PARAM_CHART = 'chart';
/** `0` retire la non-reponse de l AFFICHAGE, jamais du calcul. */
export const PARAM_NON_RESPONSES = 'nr';
/** Filtre de sous-population, un par modalite retenue : `filtre=region:bre`. */
export const PARAM_FILTER = 'filtre';
/** Ordre d affichage des modalites. Absent = l ordre que le type de question merite. */
export const PARAM_SORT = 'tri';
/**
 * Lecture des cases d un croisement : en ligne, en colonne, sur le total, ou
 * en effectifs. Voir `charts/crosstab-cell.ts`, ou les quatre sont definies.
 */
export const PARAM_BASIS = 'base';
/**
 * `redresse` demande la lecture redressee. Absent ou autre valeur = la lecture
 * brute, qui reste la reference : un lien partage sans ce parametre ne doit
 * jamais basculer tout seul sur des chiffres ponderes.
 */
export const PARAM_READING = 'lecture';
export const WEIGHTED_READING = 'redresse';

/**
 * Le comparatif par sous-groupe du rapport de redressement
 * (`/donnees/[slug]/redressement`) : quelle question, quelle reponse, selon
 * quel sous-groupe. Meme contrat que les parametres de l explorateur.
 */
export const PARAM_REPORT_QUESTION = 'question';
export const PARAM_REPORT_ANSWER = 'reponse';
export const PARAM_REPORT_GROUP = 'groupe';

/**
 * Ordre d affichage des modalites.
 *
 * `effectif` classe du plus cite au moins cite, ce qui rend une liste de choix
 * lisible d un coup d oeil. `questionnaire` garde l ordre declare, le seul
 * acceptable pour une echelle ou des tranches d age : « 18-24 » vient avant
 * « 25-34 », et un tri par effectif transformerait l axe en dents de scie.
 *
 * Absent de l adresse, l explorateur choisit selon le type de question. Present,
 * le visiteur a tranche et on ne revient pas dessus.
 */
export type SortMode = 'effectif' | 'questionnaire';

const SORT_MODES: readonly SortMode[] = ['effectif', 'questionnaire'];

export function parseSort(raw: string | null): SortMode | null {
	return SORT_MODES.find((mode) => mode === raw) ?? null;
}

/**
 * Restriction de la population sur UNE question.
 *
 * Plusieurs modalites dans une clause se lisent en OU (« Bretagne ou
 * Normandie »), plusieurs clauses se lisent en ET (« Bretagne ET 18-24 ans »).
 * C est la lecture attendue d un panneau de filtres : cocher deux cases dans la
 * meme liste elargit, cocher dans deux listes restreint.
 */
export interface FilterClause {
	readonly questionCode: string;
	readonly modalityKeys: readonly string[];
}

export interface ExploreParams {
	readonly x: string | null;
	readonly y: string | null;
	/** Question de decoupage. Absente = un seul resultat. */
	readonly z: string | null;
	readonly chart: string;
	readonly includeNonResponses: boolean;
	readonly filters: readonly FilterClause[];
	/** `null` laisse l explorateur choisir selon le type de question. */
	readonly sort: SortMode | null;
	/** Lecture des cases d un croisement. `null` = la lecture en ligne. */
	readonly basis: CellBasis | null;
	/** Lecture redressee demandee. Elle n est servie que si un redressement est publie. */
	readonly weighted: boolean;
}

/**
 * Valeur d un parametre `filtre`, telle qu elle voyage dans l URL et telle que
 * la porte une case a cocher du formulaire.
 *
 * Le formulaire sans JavaScript emet une valeur par case cochee, et le client
 * reecrit exactement la meme chose : les deux chemins produisent la meme
 * adresse, octet pour octet.
 */
export function filterValue(questionCode: string, modalityKey: string): string {
	return `${questionCode}:${modalityKey}`;
}

/**
 * Regroupe les valeurs `filtre` par question, en preservant l ordre d apparition.
 *
 * La forme abregee `region:bre,nor` est acceptee parce qu une adresse se tape
 * aussi a la main ; elle n est jamais produite par le site.
 */
export function parseFilterValues(values: readonly string[]): readonly FilterClause[] {
	const byCode = new Map<string, string[]>();

	for (const value of values) {
		const separator = value.indexOf(':');
		if (separator <= 0) continue;

		const code = value.slice(0, separator);
		const keys = value.slice(separator + 1).split(',');
		collectKeys(byCode, code, keys);
	}

	return [...byCode].map(([questionCode, modalityKeys]) => ({ questionCode, modalityKeys }));
}

function collectKeys(byCode: Map<string, string[]>, code: string, keys: readonly string[]): void {
	const bucket = byCode.get(code) ?? [];

	for (const key of keys) {
		if (key === '' || bucket.includes(key)) continue;
		bucket.push(key);
	}

	if (bucket.length > 0) byCode.set(code, bucket);
}

export function parseExploreParams(params: URLSearchParams): ExploreParams {
	return {
		x: params.get(PARAM_X),
		y: params.get(PARAM_Y),
		z: params.get(PARAM_Z),
		chart: params.get(PARAM_CHART) ?? '',
		// Seule la valeur « 0 » exclut. Un parametre absent, vide ou inattendu
		// AFFICHE la non-reponse : l oubli doit pencher du cote de la montrer.
		includeNonResponses: params.get(PARAM_NON_RESPONSES) !== '0',
		filters: parseFilterValues(params.getAll(PARAM_FILTER)),
		sort: parseSort(params.get(PARAM_SORT)),
		basis: parseCellBasis(params.get(PARAM_BASIS)),
		weighted: params.get(PARAM_READING) === WEIGHTED_READING
	};
}

/**
 * Reecrit l adresse de l explorateur.
 *
 * L ordre des parametres est fixe et ne depend pas de l ordre des clics : deux
 * visiteurs arrivant au meme etat par deux chemins differents doivent pouvoir
 * comparer leurs liens.
 */
export function exploreSearch(params: ExploreParams): string {
	const search = new URLSearchParams();

	if (params.x) search.set(PARAM_X, params.x);
	if (params.y) search.set(PARAM_Y, params.y);
	if (params.z) search.set(PARAM_Z, params.z);
	if (params.chart) search.set(PARAM_CHART, params.chart);
	if (!params.includeNonResponses) search.set(PARAM_NON_RESPONSES, '0');

	if (params.sort) search.set(PARAM_SORT, params.sort);
	if (params.basis) search.set(PARAM_BASIS, params.basis);
	if (params.weighted) search.set(PARAM_READING, WEIGHTED_READING);

	for (const clause of params.filters) {
		for (const key of clause.modalityKeys) {
			search.append(PARAM_FILTER, filterValue(clause.questionCode, key));
		}
	}

	return search.toString();
}

export function hasFilter(
	filters: readonly FilterClause[],
	questionCode: string,
	modalityKey: string
): boolean {
	const clause = filters.find((candidate) => candidate.questionCode === questionCode);
	return clause?.modalityKeys.includes(modalityKey) ?? false;
}

/** Nombre de modalites retenues, toutes questions confondues. */
export function countFilters(filters: readonly FilterClause[]): number {
	return filters.reduce((total, clause) => total + clause.modalityKeys.length, 0);
}

/**
 * Ajoute ou retire une modalite.
 *
 * Une clause videe de ses modalites disparait : une question filtree sur rien
 * n est pas une restriction sur l ensemble vide, c est l absence de filtre.
 */
export function toggleFilter(
	filters: readonly FilterClause[],
	questionCode: string,
	modalityKey: string
): readonly FilterClause[] {
	const next = filters.map((clause) =>
		clause.questionCode === questionCode ? toggleKey(clause, modalityKey) : clause
	);

	if (!filters.some((clause) => clause.questionCode === questionCode)) {
		next.push({ questionCode, modalityKeys: [modalityKey] });
	}

	return next.filter((clause) => clause.modalityKeys.length > 0);
}

function toggleKey(clause: FilterClause, modalityKey: string): FilterClause {
	const keys = clause.modalityKeys.includes(modalityKey)
		? clause.modalityKeys.filter((key) => key !== modalityKey)
		: [...clause.modalityKeys, modalityKey];

	return { questionCode: clause.questionCode, modalityKeys: keys };
}

/** Retire toutes les modalites retenues sur une question. */
export function clearFilter(
	filters: readonly FilterClause[],
	questionCode: string
): readonly FilterClause[] {
	return filters.filter((clause) => clause.questionCode !== questionCode);
}
