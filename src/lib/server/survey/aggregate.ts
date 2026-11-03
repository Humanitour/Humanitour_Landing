import {
	hasNumericLabels,
	leadingNumber,
	NON_RESPONSE_KEY,
	type ModalityDescriptor
} from '$lib/shared/questions';
import { protectDistribution, protectTable, type ProtectedTable } from './anonymity';

/**
 * Agregation des reponses.
 *
 * Deux invariants, qui sont la difference revendiquee avec les instituts prives :
 *
 *   - Le comptage brut existe TOUJOURS. Depuis le 20 septembre 2026 un
 *     redressement peut s ajouter, mais il s ajoute : il ne remplace rien. Les
 *     champs `count` et `share` restent le comptage reel, `weightedCount` et
 *     `weightedShare` viennent a cote, et c est l affichage qui choisit. Un
 *     redressement qui ecraserait le brut serait exactement le redressement
 *     opaque que l institut reproche aux autres.
 *   - La base des pourcentages est toujours le nombre de REPONDANTS, jamais le
 *     nombre de reponses. Pour une question a choix multiple, la somme des parts
 *     depasse donc 100 %, et c est la lecture honnete.
 *
 * LE POINT DE SURETE, a ne jamais defaire : le masquage se decide sur les
 * effectifs BRUTS. Trois repondants peses 2,0 font 6,0, et un seuil compare a
 * 6,0 publierait une case qui ne repose que sur trois personnes. Le
 * redressement ne doit pas pouvoir relever une case sous le seuil : une case
 * masquee en brut l est aussi en redresse, et `aggregate.test.ts` le verifie.
 *
 * L agregation ne lit que `modalityKey`. Elle n a aucun cas particulier a traiter
 * pour la non-reponse, qui arrive ici comme une modalite ordinaire.
 */

export interface AnswerRow {
	readonly responseId: string;
	readonly modalityKey: string;
}

export interface AggregateOptions {
	readonly threshold?: number;
	/** Inclure la modalite de non-reponse dans le resultat. Vrai par defaut. */
	readonly includeNonResponses?: boolean;
	/**
	 * Poids par repondant, quand un redressement est actif.
	 *
	 * Absent, le resultat ne porte aucun chiffre redresse — et non des chiffres
	 * redresses egaux aux bruts : « pas de redressement » et « un redressement
	 * qui ne change rien » ne se disent pas de la meme facon a l ecran.
	 */
	readonly weights?: ReadonlyMap<string, number>;
}

export interface DistributionBar {
	readonly key: string;
	readonly label: string;
	readonly isNonResponse: boolean;
	readonly color: string | null;
	/** `null` quand la case est masquee par le seuil d anonymat. */
	readonly count: number | null;
	/** Part des repondants, entre 0 et 1. `null` quand la case est masquee. */
	readonly share: number | null;
	/**
	 * Effectif redresse. `null` sans redressement, et `null` des que la case est
	 * masquee : le masquage se decide en brut et s applique aux deux lectures.
	 */
	readonly weightedCount: number | null;
	readonly weightedShare: number | null;
	readonly suppressed: boolean;
}

export interface DistributionResult {
	readonly bars: readonly DistributionBar[];
	/** Repondants distincts. Base de tous les pourcentages bruts. */
	readonly respondents: number;
	/** Somme des poids des repondants. `null` sans redressement. */
	readonly weightedRespondents: number | null;
	readonly threshold: number;
	readonly suppressedCount: number;
}

/**
 * Ordonne les modalites observees.
 *
 * Les modalites declarees viennent en premier, dans leur ordre d affichage. Celles
 * qui n etaient pas enumerables a l avance — les valeurs d une question numerique
 * sans tranches, par exemple — sont ajoutees ensuite, triees. La non-reponse ferme
 * toujours la marche : elle est comptee comme les autres, mais se lit en dernier.
 */
export function orderModalities(
	declared: readonly ModalityDescriptor[],
	observed: Iterable<string>
): readonly ModalityDescriptor[] {
	const known = new Set(declared.map((modality) => modality.key));
	const extra = [...new Set(observed)]
		.filter((key) => !known.has(key) && key !== NON_RESPONSE_KEY)
		.sort(compareModalityKeys)
		.map((key) => ({ key, label: key, isNonResponse: false, color: null }));

	const declaredRegular = declared.filter((modality) => !modality.isNonResponse);
	const nonResponse = declared.filter((modality) => modality.isNonResponse);
	// Des tranches (« 18 – 24 », « 65 + ») se lisent dans l ordre des nombres,
	// quel que soit l ordre dans lequel le questionnaire les a declarees.
	const regular = hasNumericLabels(declaredRegular)
		? [...declaredRegular].sort((a, b) => leadingNumber(a.label) - leadingNumber(b.label))
		: declaredRegular;

	return [...regular, ...extra, ...nonResponse];
}

/** Tri naturel : « 9 » avant « 10 », et « 18-24 » avant « 25-34 ». */
function compareModalityKeys(a: string, b: string): number {
	const numericA = Number.parseFloat(a);
	const numericB = Number.parseFloat(b);

	if (Number.isFinite(numericA) && Number.isFinite(numericB) && numericA !== numericB) {
		return numericA - numericB;
	}

	return a.localeCompare(b, 'fr');
}

/**
 * Les lignes a compter.
 *
 * Retirer la non-reponse de l affichage sans la retirer de la base donnait des
 * parts qui ne sommaient plus a 100 % : le repondant a qui la question n a pas
 * ete posee restait au denominateur. On la retire donc AVANT de compter.
 */
function retained(answers: readonly AnswerRow[], options: AggregateOptions): readonly AnswerRow[] {
	if (options.includeNonResponses !== false) return answers;
	return answers.filter((answer) => answer.modalityKey !== NON_RESPONSE_KEY);
}

/** Repondants distincts : un repondant ayant coche trois cases ne compte qu une fois. */
function countRespondents(answers: readonly AnswerRow[]): number {
	return new Set(answers.map((answer) => answer.responseId)).size;
}

/** Somme des poids des repondants distincts. `null` sans redressement. */
function weighRespondents(
	answers: readonly AnswerRow[],
	weights: ReadonlyMap<string, number> | undefined
): number | null {
	if (!weights) return null;

	let total = 0;
	for (const id of new Set(answers.map((answer) => answer.responseId))) {
		total += weights.get(id) ?? 1;
	}

	return total;
}

/**
 * Effectifs par modalite : bruts toujours, redresses si des poids sont fournis.
 *
 * Les deux se calculent dans la MEME passe, sur la meme deduplication. Deux
 * parcours separes finiraient par diverger sur le jour ou la regle de
 * deduplication change, et le redresse ne correspondrait plus au brut qu il est
 * cense eclairer.
 */
function countByModality(
	answers: readonly AnswerRow[],
	weights: ReadonlyMap<string, number> | undefined
): { raw: Map<string, number>; weighted: Map<string, number> | null } {
	const seen = new Set<string>();
	const raw = new Map<string, number>();
	const weighted = weights ? new Map<string, number>() : null;

	for (const answer of answers) {
		const signature = `${answer.responseId}\u0000${answer.modalityKey}`;
		if (seen.has(signature)) continue;

		seen.add(signature);
		raw.set(answer.modalityKey, (raw.get(answer.modalityKey) ?? 0) + 1);

		if (weighted && weights) {
			const weight = weights.get(answer.responseId) ?? 1;
			weighted.set(answer.modalityKey, (weighted.get(answer.modalityKey) ?? 0) + weight);
		}
	}

	return { raw, weighted };
}

function share(count: number | null, base: number): number | null {
	if (count === null || base === 0) return null;
	return count / base;
}

/** Distribution d une question : l effectif de chaque modalite. */
export function distribution(
	allAnswers: readonly AnswerRow[],
	declared: readonly ModalityDescriptor[],
	options: AggregateOptions = {}
): DistributionResult {
	const answers = retained(allAnswers, options);
	const { raw, weighted } = countByModality(answers, options.weights);
	const respondents = countRespondents(answers);
	const weightedRespondents = weighRespondents(answers, options.weights);

	const modalities = orderModalities(declared, raw.keys()).filter(
		(modality) => options.includeNonResponses !== false || !modality.isNonResponse
	);

	// Sur les effectifs BRUTS : voir l avertissement en tete de fichier.
	const protectedTable = protectDistribution(
		raw,
		modalities.map((modality) => modality.key),
		options.threshold
	);

	const byKey = new Map(protectedTable.cells.map((cell) => [cell.xKey, cell]));

	const bars = modalities.map((modality) => {
		const cell = byKey.get(modality.key);
		const count = cell?.count ?? null;
		// La case masquee l est dans les deux lectures : sans cela, le chiffre
		// redresse trahirait l effectif que le seuil vient de cacher.
		const weightedCount = count === null || !weighted ? null : (weighted.get(modality.key) ?? 0);

		return {
			key: modality.key,
			label: modality.label,
			isNonResponse: modality.isNonResponse,
			color: modality.color ?? null,
			count,
			share: share(count, respondents),
			weightedCount,
			weightedShare:
				weightedRespondents === null ? null : share(weightedCount, weightedRespondents),
			suppressed: cell?.suppressed ?? false
		};
	});

	return {
		bars,
		respondents,
		weightedRespondents,
		threshold: protectedTable.threshold,
		suppressedCount: protectedTable.suppressedCount
	};
}

export interface CrosstabCell {
	readonly count: number | null;
	/** Part au sein de la ligne, entre 0 et 1. Lecture usuelle d un tri croise. */
	readonly share: number | null;
	/** Meme regle que pour une distribution : `null` sans poids, `null` si masquee. */
	readonly weightedCount: number | null;
	readonly weightedShare: number | null;
	readonly suppressed: boolean;
}

export interface CrosstabResult {
	readonly xModalities: readonly ModalityDescriptor[];
	readonly yModalities: readonly ModalityDescriptor[];
	/** Indexe par cle de modalite X, puis par cle de modalite Y. */
	readonly cells: ReadonlyMap<string, ReadonlyMap<string, CrosstabCell>>;
	readonly rowTotals: ReadonlyMap<string, number | null>;
	readonly columnTotals: ReadonlyMap<string, number | null>;
	readonly respondents: number;
	/**
	 * Totaux et base redresses. `null` sans redressement. Un total masque en
	 * brut l est aussi ici, pour la meme raison que les cases.
	 */
	readonly weighted: WeightedTotals | null;
	readonly threshold: number;
	readonly suppressedCount: number;
}

export interface WeightedTotals {
	readonly rowTotals: ReadonlyMap<string, number | null>;
	readonly columnTotals: ReadonlyMap<string, number | null>;
	readonly respondents: number;
}

/**
 * Apparie les reponses de deux questions par repondant.
 *
 * Un repondant ayant coche deux modalites en X et trois en Y produit six couples.
 * Chaque couple n est compte qu une fois, meme si le meme repondant l a produit
 * deux fois.
 */
function pairs(
	xAnswers: readonly AnswerRow[],
	yAnswers: readonly AnswerRow[],
	weights: ReadonlyMap<string, number> | undefined
): { raw: Map<string, number>; weighted: Map<string, number> | null } {
	const yByResponse = new Map<string, string[]>();

	for (const answer of yAnswers) {
		const bucket = yByResponse.get(answer.responseId);
		if (bucket) {
			bucket.push(answer.modalityKey);
			continue;
		}
		yByResponse.set(answer.responseId, [answer.modalityKey]);
	}

	const seen = new Set<string>();
	const raw = new Map<string, number>();
	const weighted = weights ? new Map<string, number>() : null;

	for (const answer of xAnswers) {
		const yKeys = yByResponse.get(answer.responseId);
		if (!yKeys) continue;
		collectPairs(answer, yKeys, seen, raw, weighted, weights?.get(answer.responseId) ?? 1);
	}

	return { raw, weighted };
}

function collectPairs(
	answer: AnswerRow,
	yKeys: readonly string[],
	seen: Set<string>,
	raw: Map<string, number>,
	weighted: Map<string, number> | null,
	weight: number
): void {
	for (const yKey of yKeys) {
		const signature = `${answer.responseId}\u0000${answer.modalityKey}\u0000${yKey}`;
		if (seen.has(signature)) continue;

		seen.add(signature);
		const cellKey = `${answer.modalityKey}\u0000${yKey}`;
		raw.set(cellKey, (raw.get(cellKey) ?? 0) + 1);
		weighted?.set(cellKey, (weighted.get(cellKey) ?? 0) + weight);
	}
}

/**
 * Totaux de ligne et de colonne redresses.
 *
 * Recalcules ici plutot que rendus par la protection : celle-ci raisonne en
 * effectifs bruts, c est son role. La part redressee se lit donc sur une base
 * redressee — melanger les deux donnerait des pourcentages qui ne somment a
 * rien. Comme les totaux bruts, ils ne somment que les modalites retenues : une
 * non-reponse retiree de l affichage ne doit pas gonfler le denominateur d un
 * seul des deux cotes.
 */
function weightedLineTotals(
	weighted: Map<string, number>,
	xKeys: readonly string[],
	yKeys: readonly string[]
): { rows: Map<string, number>; columns: Map<string, number> } {
	const rows = new Map<string, number>();
	const columns = new Map<string, number>();

	for (const xKey of xKeys) {
		for (const yKey of yKeys) {
			const value = weighted.get(`${xKey}\u0000${yKey}`) ?? 0;
			rows.set(xKey, (rows.get(xKey) ?? 0) + value);
			columns.set(yKey, (columns.get(yKey) ?? 0) + value);
		}
	}

	return { rows, columns };
}

/** Un total redresse, masque des que son homologue brut l est. */
function maskLike(
	raw: ReadonlyMap<string, number | null>,
	weighted: Map<string, number>
): Map<string, number | null> {
	return new Map(
		[...raw].map(([key, value]) => [key, value === null ? null : (weighted.get(key) ?? 0)])
	);
}

/**
 * La lecture redressee d une case, si redressement il y a.
 *
 * Masquee en brut, masquee en redresse : le seuil se decide une fois, sur les
 * effectifs reels, et la seconde lecture ne peut pas rouvrir ce que la premiere
 * a ferme.
 */
function weighCell(
	cell: { xKey: string; yKey: string; count: number | null },
	rowTotal: number | null,
	weighted: Map<string, number> | null,
	weightedTotal: number | null
): { weightedCount: number | null; weightedShare: number | null } {
	if (cell.count === null || !weighted) return { weightedCount: null, weightedShare: null };

	const weightedCount = weighted.get(`${cell.xKey}\u0000${cell.yKey}`) ?? 0;

	return {
		weightedCount,
		weightedShare:
			weightedTotal === null || rowTotal === null ? null : share(weightedCount, weightedTotal)
	};
}

function indexCells(
	table: ProtectedTable,
	weighted: Map<string, number> | null,
	weightedTotals: Map<string, number> | null
): Map<string, Map<string, CrosstabCell>> {
	const rows = new Map<string, Map<string, CrosstabCell>>();

	for (const cell of table.cells) {
		const row = rows.get(cell.xKey) ?? new Map<string, CrosstabCell>();
		const rowTotal = table.rowTotals.get(cell.xKey) ?? null;

		row.set(cell.yKey, {
			count: cell.count,
			share: rowTotal === null ? null : share(cell.count, rowTotal),
			...weighCell(cell, rowTotal, weighted, weightedTotals?.get(cell.xKey) ?? null),
			suppressed: cell.suppressed
		});

		rows.set(cell.xKey, row);
	}

	return rows;
}

/** Tableau croise de deux questions. */
export function crosstab(
	xAnswers: readonly AnswerRow[],
	yAnswers: readonly AnswerRow[],
	xDeclared: readonly ModalityDescriptor[],
	yDeclared: readonly ModalityDescriptor[],
	options: AggregateOptions = {}
): CrosstabResult {
	xAnswers = retained(xAnswers, options);
	yAnswers = retained(yAnswers, options);
	const { raw: counted, weighted } = pairs(xAnswers, yAnswers, options.weights);

	const observedX = [...counted.keys()].map((key) => key.split('\u0000')[0] ?? '');
	const observedY = [...counted.keys()].map((key) => key.split('\u0000')[1] ?? '');

	const keep = (modality: ModalityDescriptor) =>
		options.includeNonResponses !== false || !modality.isNonResponse;

	const xModalities = orderModalities(xDeclared, observedX).filter(keep);
	const yModalities = orderModalities(yDeclared, observedY).filter(keep);

	const cells = [...counted].map(([key, count]) => {
		const [xKey = '', yKey = ''] = key.split('\u0000');
		return { xKey, yKey, count };
	});

	const table = protectTable(
		cells,
		xModalities.map((modality) => modality.key),
		yModalities.map((modality) => modality.key),
		options.threshold
	);

	const sharedResponses = new Set(xAnswers.map((answer) => answer.responseId));
	const crossed = new Set(
		yAnswers.map((answer) => answer.responseId).filter((id) => sharedResponses.has(id))
	);

	const lineTotals = weighted
		? weightedLineTotals(
				weighted,
				xModalities.map((modality) => modality.key),
				yModalities.map((modality) => modality.key)
			)
		: null;

	return {
		xModalities,
		yModalities,
		cells: indexCells(table, weighted, lineTotals?.rows ?? null),
		rowTotals: table.rowTotals,
		columnTotals: table.columnTotals,
		respondents: crossed.size,
		weighted:
			lineTotals && options.weights
				? {
						rowTotals: maskLike(table.rowTotals, lineTotals.rows),
						columnTotals: maskLike(table.columnTotals, lineTotals.columns),
						respondents: sumWeights(crossed, options.weights)
					}
				: null,
		threshold: table.threshold,
		suppressedCount: table.suppressedCount
	};
}

function sumWeights(ids: Iterable<string>, weights: ReadonlyMap<string, number>): number {
	let total = 0;
	for (const id of ids) total += weights.get(id) ?? 1;
	return total;
}
