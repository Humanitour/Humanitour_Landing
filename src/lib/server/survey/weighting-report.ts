import type { ModalityDescriptor } from '$lib/shared/questions';
import { crosstab, distribution, type AnswerRow } from './aggregate';
import { kish } from './weighting';

/**
 * Le rapport public du redressement : ce que les poids changent, chiffre par
 * chiffre.
 *
 * Tout passe par `distribution` et `crosstab`, les memes fonctions que
 * l explorateur : une part lue ici est donc exactement celle que l explorateur
 * affiche en lecture brute ou redressee, et le seuil d anonymat s y applique de
 * la meme facon, sur les effectifs BRUTS.
 *
 * La marge d erreur est celle d un sondage aleatoire simple, a 95 %. Elle est
 * calculee sur le nombre de repondants pour le brut, et sur la taille effective
 * de Kish pour le redresse : c est la que se lit le cout du redressement en
 * precision. L echantillon n etant pas aleatoire, c est un ordre de grandeur,
 * et la page le dit.
 */

/** Quantile de la loi normale pour un intervalle de confiance a 95 %. */
export const CONFIDENCE_Z = 1.96;

/** Combien de deplacements le recapitulatif retient, toutes questions confondues. */
export const SHIFT_LIMIT = 8;

/** Demi-largeur de l intervalle de confiance a 95 % d une part. `null` sans base. */
export function marginOfError(share: number | null, size: number): number | null {
	if (share === null || size <= 0) return null;
	return CONFIDENCE_Z * Math.sqrt((share * (1 - share)) / size);
}

/** Taille effective de Kish d un ensemble de repondants. */
export function effectiveSize(ids: Iterable<string>, weights: ReadonlyMap<string, number>): number {
	return kish([...ids].map((id) => weights.get(id) ?? 1)).effectiveSampleSize;
}

/** Une part, lue brute puis redressee, avec ce qui permet de juger l ecart. */
export interface ComparedShare {
	readonly raw: number | null;
	readonly weighted: number | null;
	/** Redresse moins brut, en part. `null` des qu une des deux manque. */
	readonly gap: number | null;
	readonly rawMargin: number | null;
	readonly weightedMargin: number | null;
	/** L ecart depasse la marge d erreur du brut : le redressement deplace le chiffre plus que l alea. */
	readonly beyondMargin: boolean;
}

function compareShares(
	raw: number | null,
	weighted: number | null,
	size: number,
	effective: number
): ComparedShare {
	const gap = raw === null || weighted === null ? null : weighted - raw;
	const rawMargin = marginOfError(raw, size);

	return {
		raw,
		weighted,
		gap,
		rawMargin,
		weightedMargin: marginOfError(weighted, effective),
		beyondMargin: gap !== null && rawMargin !== null && Math.abs(gap) > rawMargin
	};
}

export interface ComparedModality extends ComparedShare {
	readonly key: string;
	readonly label: string;
	readonly isNonResponse: boolean;
	readonly suppressed: boolean;
}

/** Une question de l enquete, avec ses reponses. */
export interface ReportQuestion {
	readonly code: string;
	readonly label: string;
	readonly modalities: readonly ModalityDescriptor[];
	readonly rows: readonly AnswerRow[];
}

export interface QuestionComparison {
	readonly code: string;
	readonly label: string;
	readonly respondents: number;
	readonly effectiveRespondents: number;
	readonly rows: readonly ComparedModality[];
}

function respondentsOf(rows: readonly AnswerRow[]): Set<string> {
	return new Set(rows.map((row) => row.responseId));
}

/**
 * Une question, modalite par modalite, brute et redressee.
 *
 * La non-reponse reste dans le resultat : elle est une modalite comme les
 * autres (AGENTS.md section 1.2), et le redressement la deplace aussi.
 */
export function compareQuestion(
	question: ReportQuestion,
	weights: ReadonlyMap<string, number>,
	threshold: number
): QuestionComparison {
	const result = distribution(question.rows, question.modalities, { weights, threshold });
	const effective = effectiveSize(respondentsOf(question.rows), weights);

	return {
		code: question.code,
		label: question.label,
		respondents: result.respondents,
		effectiveRespondents: effective,
		rows: result.bars.map((bar) => ({
			key: bar.key,
			label: bar.label,
			isNonResponse: bar.isNonResponse,
			suppressed: bar.suppressed,
			...compareShares(bar.share, bar.weightedShare, result.respondents, effective)
		}))
	};
}

export interface Shift {
	readonly questionCode: string;
	readonly questionLabel: string;
	readonly row: ComparedModality;
}

/**
 * Les reponses que le redressement deplace le plus, toutes questions confondues.
 *
 * Classees par ecart absolu : un recul compte autant qu une hausse. A ecart
 * egal, l ordre des questions puis des modalites tranche, pour qu un meme
 * calcul donne toujours la meme liste.
 */
export function largestShifts(
	comparisons: readonly QuestionComparison[],
	limit = SHIFT_LIMIT
): Shift[] {
	const shifts = comparisons.flatMap((comparison) =>
		comparison.rows.flatMap((row) =>
			row.gap === null
				? []
				: [
						{
							shift: { questionCode: comparison.code, questionLabel: comparison.label, row },
							size: Math.abs(row.gap)
						}
					]
		)
	);

	return shifts
		.map((entry, order) => ({ ...entry, order }))
		.sort((a, b) => b.size - a.size || a.order - b.order)
		.slice(0, limit)
		.map(({ shift }) => shift);
}

export interface SubgroupRow extends ComparedShare {
	readonly key: string;
	readonly label: string;
	readonly isNonResponse: boolean;
	/** Sous-groupe trop petit, ou case masquee : aucun chiffre n en sort. */
	readonly suppressed: boolean;
	readonly respondents: number | null;
	readonly effectiveRespondents: number | null;
}

export interface SubgroupComparison {
	readonly modality: { readonly key: string; readonly label: string };
	readonly rows: readonly SubgroupRow[];
}

const HIDDEN: Omit<SubgroupRow, 'key' | 'label' | 'isNonResponse'> = {
	suppressed: true,
	respondents: null,
	effectiveRespondents: null,
	raw: null,
	weighted: null,
	gap: null,
	rawMargin: null,
	weightedMargin: null,
	beyondMargin: false
};

/** Repondants a la question, ranges par modalite du sous-groupe. */
function membersByGroup(
	group: readonly AnswerRow[],
	answered: ReadonlySet<string>
): Map<string, Set<string>> {
	const members = new Map<string, Set<string>>();

	for (const row of group) {
		if (!answered.has(row.responseId)) continue;
		const bucket = members.get(row.modalityKey) ?? new Set<string>();
		bucket.add(row.responseId);
		members.set(row.modalityKey, bucket);
	}

	return members;
}

/**
 * Une reponse a une question, sous-groupe par sous-groupe.
 *
 * C est la lecture en ligne du tri croise de l explorateur (« parmi les
 * 18-24 ans, X % ») : memes parts, meme masquage. Un sous-groupe dont le
 * nombre de repondants distincts passe sous le seuil est masque en entier.
 * Sur une question a choix multiple, le total de ligne compte des couples et
 * peut passer le seuil quand les personnes, elles, ne le passent pas : c est
 * le nombre de personnes qui decide, parce que c est lui qui est publie.
 */
export function compareBySubgroup(
	group: ReportQuestion,
	question: ReportQuestion,
	modalityKey: string,
	weights: ReadonlyMap<string, number>,
	threshold: number
): SubgroupComparison | null {
	const table = crosstab(group.rows, question.rows, group.modalities, question.modalities, {
		weights,
		threshold
	});
	const modality = table.yModalities.find((candidate) => candidate.key === modalityKey);
	if (!modality) return null;

	const members = membersByGroup(group.rows, respondentsOf(question.rows));

	const rows = table.xModalities.map((groupModality): SubgroupRow => {
		const base = {
			key: groupModality.key,
			label: groupModality.label,
			isNonResponse: groupModality.isNonResponse
		};
		const ids = members.get(groupModality.key) ?? new Set<string>();
		const cell = table.cells.get(groupModality.key)?.get(modalityKey);
		const hidden =
			!cell ||
			cell.suppressed ||
			table.rowTotals.get(groupModality.key) === null ||
			ids.size < threshold;
		if (hidden) return { ...base, ...HIDDEN };

		const effective = effectiveSize(ids, weights);
		return {
			...base,
			suppressed: false,
			respondents: ids.size,
			effectiveRespondents: effective,
			...compareShares(cell.share, cell.weightedShare, ids.size, effective)
		};
	});

	return { modality: { key: modality.key, label: modality.label }, rows };
}
