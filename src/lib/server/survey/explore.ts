import { NON_RESPONSE_KEY, type ModalityDescriptor } from '$shared/questions';
import type { FilterClause, SortMode } from '$shared/explore';
import {
	crosstab,
	distribution,
	type AnswerRow,
	type CrosstabResult,
	type DistributionResult
} from './aggregate';
import { isTooSmall, within, type DroppedClause, type Population } from './population';

/**
 * Construction du resultat de l explorateur.
 *
 * Ce fichier existe pour une seule raison : la page publique et l API publique
 * doivent rendre EXACTEMENT le meme chiffre. Deux chemins qui recalculent
 * chacun de leur cote finissent par diverger d un arrondi, d un filtre oublie
 * ou d un seuil applique a moitie, et le site publierait alors deux verites.
 *
 * Il est volontairement sans acces a la base : l appelant apporte les lignes
 * deja lues, ce fichier ne fait que compter et proteger.
 */

/** Un axe, tel que l explorateur en a besoin pour compter. */
export interface Axis {
	readonly code: string;
	readonly label: string;
	readonly modalities: readonly ModalityDescriptor[];
	readonly rows: readonly AnswerRow[];
}

export interface ExploreInputs {
	readonly x: Axis;
	/** Absent = distribution simple. */
	readonly y: Axis | null;
	readonly population: Population;
	readonly threshold: number;
	readonly includeNonResponses: boolean;
	/**
	 * Poids par repondant. Present = lecture redressee : les effectifs et les
	 * parts rendus sont ponderes. Le masquage, lui, se decide toujours sur les
	 * effectifs bruts (`aggregate.ts`).
	 */
	readonly weights?: ReadonlyMap<string, number> | null;
}

/**
 * Le resultat, ou la raison pour laquelle il n y en a pas.
 *
 * `too-small` n est pas une erreur : c est un resultat honnete. La combinaison
 * de filtres demandee porte sur trop peu de monde pour etre publiee sans
 * designer quelqu un, et le dire vaut mieux qu afficher un graphique entierement
 * masque sans expliquer pourquoi.
 */
export type ExploreOutcome =
	| { readonly kind: 'distribution'; readonly distribution: DistributionResult }
	| { readonly kind: 'crosstab'; readonly crosstab: CrosstabResult }
	| { readonly kind: 'too-small' };

/**
 * Questions portant les deux axes, choisies parmi les seules questions
 * croisables.
 *
 * Trois regles, et chacune vient d un lien partage qui doit survivre :
 *
 *   - un `x` inconnu retombe sur la premiere question plutot que sur une 404 ;
 *   - un `y` inconnu est ignore, le lien rend alors une distribution simple ;
 *   - un `y` egal a `x` est ignore : croiser une question avec elle-meme ne
 *     produit qu une diagonale, qui n apprend rien et masque tout le reste.
 *
 * On ne cherche que dans les questions croisables. Une question en texte libre
 * a presque autant de modalites que de repondants : la porter en axe
 * afficherait des reponses individuelles, ce que le seuil d anonymat masquerait
 * ligne a ligne sans rien apporter.
 */
export function selectAxes<Q extends { readonly code: string }>(
	crossable: readonly Q[],
	requested: { readonly x: string | null; readonly y: string | null; readonly z?: string | null }
): { readonly x: Q | null; readonly y: Q | null; readonly z: Q | null } {
	const find = (code: string | null | undefined) =>
		code ? (crossable.find((question) => question.code === code) ?? null) : null;

	const x = find(requested.x) ?? crossable[0] ?? null;
	const requestedY = find(requested.y);
	const y = requestedY && requestedY.code !== x?.code ? requestedY : null;

	// La question de decoupage doit etre DIFFERENTE des deux autres : se
	// decouper par sa propre abscisse ne produit qu une diagonale de panneaux a
	// une seule barre.
	const requestedZ = find(requested.z);
	const distinct = requestedZ && requestedZ.code !== x?.code && requestedZ.code !== y?.code;

	return { x, y, z: distinct ? requestedZ : null };
}

/** Forme de donnees demandee, independamment de ce qu on a pu publier. */
export function shapeOf(inputs: Pick<ExploreInputs, 'y'>): 'distribution' | 'crosstab' {
	return inputs.y ? 'crosstab' : 'distribution';
}

export function buildOutcome(inputs: ExploreInputs): ExploreOutcome {
	const { population, threshold, includeNonResponses } = inputs;

	// Le garde-fou passe AVANT le calcul. Calculer puis masquer laisserait
	// l effectif de la population filtree sortir dans la reponse.
	if (isTooSmall(population, threshold)) return { kind: 'too-small' };

	const xRows = within(inputs.x.rows, population);
	const weights = inputs.weights ?? undefined;
	const options = { threshold, includeNonResponses, weights };

	const outcome: ExploreOutcome = inputs.y
		? {
				kind: 'crosstab',
				crosstab: crosstab(
					xRows,
					within(inputs.y.rows, population),
					inputs.x.modalities,
					inputs.y.modalities,
					options
				)
			}
		: { kind: 'distribution', distribution: distribution(xRows, inputs.x.modalities, options) };

	return weights ? weightedReading(outcome) : outcome;
}

/** Deux decimales : un effectif pondere n a pas de sens au-dela. */
function roundWeighted(value: number | null): number | null {
	return value === null ? null : Math.round(value * 100) / 100;
}

/**
 * La lecture redressee d un resultat.
 *
 * Les cases portent les effectifs et parts ponderes a la place des bruts, pour
 * que les graphiques, le tableau, les constats et les exports n aient qu une
 * seule forme a lire. Deux choses ne bougent pas :
 *
 *   - le masquage, decide en brut : une case masquee a un redresse `null` ;
 *   - `respondents`, qui reste le nombre de PERSONNES. C est la base qu on
 *     cite, et une base « 48,3 repondants » ne designe personne.
 */
export function weightedReading(outcome: ExploreOutcome): ExploreOutcome {
	if (outcome.kind === 'too-small') return outcome;

	if (outcome.kind === 'distribution') {
		const result = outcome.distribution;
		return {
			kind: 'distribution',
			distribution: {
				...result,
				bars: result.bars.map((bar) => ({
					...bar,
					count: roundWeighted(bar.weightedCount),
					share: bar.weightedShare
				}))
			}
		};
	}

	const table = outcome.crosstab;
	if (!table.weighted) return outcome;

	const cells = new Map(
		[...table.cells].map(([xKey, row]) => [
			xKey,
			new Map(
				[...row].map(([yKey, cell]) => [
					yKey,
					{ ...cell, count: roundWeighted(cell.weightedCount), share: cell.weightedShare }
				])
			)
		])
	);

	return {
		kind: 'crosstab',
		crosstab: {
			...table,
			cells,
			rowTotals: table.weighted.rowTotals,
			columnTotals: table.weighted.columnTotals
		}
	};
}

/**
 * Ordre d affichage a appliquer.
 *
 * Par defaut on classe par effectif : sur une liste de choix, l ordre du
 * questionnaire n apprend rien et la hierarchie se lit alors sans comparer des
 * longueurs de barres. Une question qui porte son propre ordre (echelle,
 * tranches) garde le sien, sinon l axe perd son sens.
 */
export function resolveSort(requested: SortMode | null, questionIsOrdered: boolean): SortMode {
	if (requested) return requested;
	return questionIsOrdered ? 'questionnaire' : 'effectif';
}

/**
 * Rang de tri d une modalite.
 *
 * Trois etages, et le troisieme est le plus important : la non-reponse ferme
 * toujours la marche. Elle est comptee comme les autres, mais la classer par
 * effectif la placerait parfois en tete, ce qui donnerait a lire « la reponse
 * la plus frequente est l absence de reponse » comme un resultat de meme nature
 * que les autres. Elle se lit en dernier, comme partout ailleurs.
 */
function sortRank(isNonResponse: boolean, count: number | null): number {
	if (isNonResponse) return 2;
	return count === null ? 1 : 0;
}

function byCount(
	a: { isNonResponse: boolean; count: number | null },
	b: { isNonResponse: boolean; count: number | null }
): number {
	const rank = sortRank(a.isNonResponse, a.count) - sortRank(b.isNonResponse, b.count);
	if (rank !== 0) return rank;

	return (b.count ?? 0) - (a.count ?? 0);
}

/**
 * Reordonne un resultat pour l affichage.
 *
 * Le tri est un geste d AFFICHAGE : il n entre pas dans `aggregate.ts`, qui
 * compte et protege. Une case masquee reste masquee a sa nouvelle place, et
 * aucun effectif ne change.
 */
export function sortOutcome(outcome: ExploreOutcome, mode: SortMode): ExploreOutcome {
	if (mode === 'questionnaire' || outcome.kind === 'too-small') return outcome;

	if (outcome.kind === 'distribution') {
		return {
			kind: 'distribution',
			distribution: {
				...outcome.distribution,
				bars: [...outcome.distribution.bars].sort(byCount)
			}
		};
	}

	const table = outcome.crosstab;
	const xModalities = [...table.xModalities].sort((a, b) =>
		byCount(
			{ isNonResponse: a.isNonResponse, count: table.rowTotals.get(a.key) ?? null },
			{ isNonResponse: b.isNonResponse, count: table.rowTotals.get(b.key) ?? null }
		)
	);

	return { kind: 'crosstab', crosstab: { ...table, xModalities } };
}

/**
 * Un panneau de petits multiples : le meme croisement, sur une sous-population.
 */
export interface Panel {
	readonly key: string;
	readonly label: string;
	readonly isNonResponse: boolean;
	readonly outcome: ExploreOutcome;
	/** Repondants du panneau. `null` quand le seuil interdit de le publier. */
	readonly size: number | null;
}

/**
 * Decoupe le resultat en petits multiples, un par modalite de la question de
 * decoupage.
 *
 * Trois variables ne tiennent pas dans un seul graphique sans en ecraser une.
 * Les petits multiples sont la reponse honnete : chaque panneau se lit comme un
 * resultat complet, avec sa propre base, et la comparaison se fait d un panneau
 * a l autre.
 *
 * Chaque panneau est protege SEPAREMENT par le seuil d anonymat. C est le point
 * sensible du decoupage : croiser trois variables divise l echantillon, et une
 * combinaison fine peut ne designer qu une personne. Un panneau sous le seuil
 * ne publie donc rien, pas meme son effectif.
 */
export function buildPanels(inputs: ExploreInputs, z: Axis): readonly Panel[] {
	const byModality = groupByModality(z.rows);

	return z.modalities
		.filter((modality) => inputs.includeNonResponses || !modality.isNonResponse)
		.map((modality) => {
			const population = narrow(inputs.population, byModality.get(modality.key) ?? new Set());
			const outcome = buildOutcome({ ...inputs, population });

			return {
				key: modality.key,
				label: modality.label,
				isNonResponse: modality.isNonResponse,
				outcome,
				size: outcome.kind === 'too-small' ? null : population.size
			};
		});
}

function groupByModality(rows: readonly AnswerRow[]): Map<string, Set<string>> {
	const grouped = new Map<string, Set<string>>();

	for (const row of rows) {
		const bucket = grouped.get(row.modalityKey);
		if (bucket) {
			bucket.add(row.responseId);
			continue;
		}
		grouped.set(row.modalityKey, new Set([row.responseId]));
	}

	return grouped;
}

/** La population courante, restreinte a un panneau. */
function narrow(population: Population, responseIds: ReadonlySet<string>): Population {
	const retained = [...responseIds].filter((id) => population.includes(id));

	return {
		includes: (id) => retained.includes(id),
		size: retained.length,
		total: population.total,
		restricted: true
	};
}

/** Nombre de cases masquees par le seuil, quelle que soit la forme. */
export function suppressedCount(outcome: ExploreOutcome): number {
	if (outcome.kind === 'distribution') return outcome.distribution.suppressedCount;
	if (outcome.kind === 'crosstab') return outcome.crosstab.suppressedCount;
	return 0;
}

/**
 * Repondants de la population a qui la question n a pas ete posee.
 *
 * Retires de la base par defaut, ils sont annonces au-dessus du resultat : un
 * retrait qu on ne chiffre pas ferait douter de chaque pourcentage.
 */
export function notAskedCount(axis: Axis, population: Population): number {
	const ids = within(axis.rows, population)
		.filter((row) => row.modalityKey === NON_RESPONSE_KEY)
		.map((row) => row.responseId);

	return new Set(ids).size;
}

/** Repondants servant de base aux pourcentages. `null` quand rien n est publie. */
export function baseOf(outcome: ExploreOutcome): number | null {
	if (outcome.kind === 'distribution') return outcome.distribution.respondents;
	if (outcome.kind === 'crosstab') return outcome.crosstab.respondents;
	return null;
}

/** Une modalite proposee au filtrage, avec son etat. */
export interface FilterOption {
	readonly key: string;
	readonly label: string;
	readonly isNonResponse: boolean;
	readonly selected: boolean;
}

export interface FilterGroup {
	readonly questionCode: string;
	readonly questionLabel: string;
	readonly options: readonly FilterOption[];
	/** Modalites retenues sur cette question. Zero = question non filtree. */
	readonly selectedCount: number;
}

/**
 * Panneau de filtres.
 *
 * La non-reponse y figure comme les autres : on doit pouvoir demander « et ceux
 * qui n ont pas repondu a cette question, ils disent quoi sur celle-la ? ». La
 * retirer de la liste reviendrait a effacer une population reelle.
 */
export function buildFilterGroups(
	questions: readonly {
		readonly code: string;
		readonly label: string;
		readonly modalities: readonly ModalityDescriptor[];
	}[],
	filters: readonly FilterClause[]
): readonly FilterGroup[] {
	const selectedByCode = new Map(
		filters.map((clause) => [clause.questionCode, new Set(clause.modalityKeys)])
	);

	return questions.map((question) => {
		const selected = selectedByCode.get(question.code) ?? new Set<string>();
		const options = question.modalities.map((modality) => ({
			key: modality.key,
			label: modality.label,
			isNonResponse: modality.isNonResponse,
			selected: selected.has(modality.key)
		}));

		return {
			questionCode: question.code,
			questionLabel: question.label,
			options,
			selectedCount: options.filter((option) => option.selected).length
		};
	});
}

/**
 * Projection JSON du resultat.
 *
 * Le tableau croise circule en `Map` entre le serveur et les composants, ce que
 * `devalue` sait transporter mais pas `JSON.stringify`. L API publique, elle,
 * est consommee par des tiers en Python ou en R : elle sort des tableaux, pas
 * des structures propres a JavaScript. C est un contrat (AGENTS.md section 1.4).
 */
export interface JsonCell {
	readonly x: string;
	readonly y: string;
	readonly effectif: number | null;
	readonly part: number | null;
	readonly masque: boolean;
}

export function outcomeToJson(outcome: ExploreOutcome): Record<string, unknown> {
	if (outcome.kind === 'too-small') {
		return { forme: 'effectif-insuffisant', cellules: [] };
	}

	if (outcome.kind === 'distribution') {
		return {
			forme: 'distribution',
			repondants: outcome.distribution.respondents,
			seuil: outcome.distribution.threshold,
			cellules: outcome.distribution.bars.map((bar) => ({
				modalite: bar.key,
				libelle: bar.label,
				nonReponse: bar.isNonResponse,
				effectif: bar.count,
				part: bar.share,
				masque: bar.suppressed
			}))
		};
	}

	return {
		forme: 'croisement',
		repondants: outcome.crosstab.respondents,
		seuil: outcome.crosstab.threshold,
		modalitesX: outcome.crosstab.xModalities.map(toJsonModality),
		modalitesY: outcome.crosstab.yModalities.map(toJsonModality),
		cellules: flattenCells(outcome.crosstab),
		totauxLigne: [...outcome.crosstab.rowTotals].map(([x, effectif]) => ({ x, effectif })),
		totauxColonne: [...outcome.crosstab.columnTotals].map(([y, effectif]) => ({ y, effectif }))
	};
}

function toJsonModality(modality: ModalityDescriptor) {
	return { modalite: modality.key, libelle: modality.label, nonReponse: modality.isNonResponse };
}

function flattenCells(table: CrosstabResult): readonly JsonCell[] {
	const cells: JsonCell[] = [];

	for (const [x, row] of table.cells) {
		for (const [y, cell] of row) {
			cells.push({ x, y, effectif: cell.count, part: cell.share, masque: cell.suppressed });
		}
	}

	return cells;
}

/**
 * La lecture redressee demandee par le lien, et pourquoi on ne la sert pas.
 *
 * Retomber sur le brut en silence ferait citer un chiffre brut comme redresse.
 */
export function describeUnavailableWeighting(prepared: {
	readonly weightingUnavailable: boolean;
	readonly weighting: { readonly fresh: boolean } | null;
}): string | null {
	if (!prepared.weightingUnavailable) return null;

	if (prepared.weighting && !prepared.weighting.fresh) {
		return 'La lecture redressée est en cours de mise à jour : des réponses sont arrivées depuis le dernier calcul des poids. Les chiffres affichés sont les données brutes.';
	}

	return "Ce lien demande la lecture redressée, mais aucun redressement n'est publié pour cette enquête. Les chiffres affichés sont les données brutes.";
}

/** Filtres non appliques, mis en mots pour l avertissement affiche au visiteur. */
export function describeDropped(dropped: readonly DroppedClause[]): string | null {
	if (dropped.length === 0) return null;

	const codes = dropped.map((clause) => `« ${clause.questionCode} »`).join(', ');
	const only = dropped.length === 1 ? dropped[0] : null;
	if (only) {
		return `Un filtre de ce lien n'a pas pu être appliqué (${codes}) : ${only.reason}. Le résultat porte sur une population plus large que celle demandée.`;
	}

	return `Des filtres de ce lien n'ont pas pu être appliqués (${codes}). Le résultat porte sur une population plus large que celle demandée.`;
}
