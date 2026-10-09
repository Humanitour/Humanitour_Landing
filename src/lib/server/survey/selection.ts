import { resolveChart } from '$charts';
import { exploreSearch, filterValue, parseFilterValues, PARAM_FILTER } from '$lib/shared/explore';
import type { ModalityDescriptor } from '$lib/shared/questions';

/**
 * La selection de l equipe : des croisements choisis, titres et commentes,
 * publies sur la fiche d une enquete et sur l accueil (`SurveyCard`).
 *
 * Une carte n est pas un resultat fige : c est un PERMALIEN de l explorateur
 * avec un titre. Le visiteur qui l ouvre lit les chiffres du moment, calcules
 * et masques comme tous les autres, et peut en changer les axes. Rien ici ne
 * stocke ni ne publie un chiffre.
 *
 * Les filtres sont ecrits au format des parametres d adresse de l explorateur,
 * `{ "filtre": ["region:bre"] }` : la carte et le lien partage par un
 * journaliste parlent la meme langue (AGENTS.md 1.4).
 */

export const TITLE_MAX = 120;
export const COMMENT_MAX = 600;

/** Une question proposable dans la selection, avec ses modalites. */
export interface SelectionQuestion {
	readonly code: string;
	readonly label: string;
	readonly modalities: readonly ModalityDescriptor[];
}

/** Ce que la base tient d une carte. */
export interface StoredCard {
	readonly id: string;
	readonly title: string;
	readonly comment: string | null;
	readonly chart: string;
	readonly xCode: string;
	readonly yCode: string | null;
	readonly filters: unknown;
}

/** Les valeurs `filtre` d une carte. Une colonne illisible vaut « aucun filtre ». */
export function readCardFilters(raw: unknown): string[] {
	if (typeof raw !== 'object' || raw === null) return [];
	const values = (raw as Record<string, unknown>)[PARAM_FILTER];
	if (!Array.isArray(values)) return [];
	return values.filter((value): value is string => typeof value === 'string');
}

export interface CardInput {
	readonly title: string;
	readonly comment: string | null;
	readonly chart: string;
	readonly xCode: string;
	readonly yCode: string | null;
	readonly filters: { readonly [PARAM_FILTER]: string[] };
}

export type ParsedCard =
	| { readonly ok: true; readonly value: CardInput }
	| { readonly ok: false; readonly message: string };

function field(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === 'string' ? value.trim() : '';
}

/** Un filtre saisi, s il designe une modalite qui existe. */
function validFilter(value: string, questions: readonly SelectionQuestion[]): boolean {
	const [clause] = parseFilterValues([value]);
	if (!clause || clause.modalityKeys.length !== 1) return false;

	const question = questions.find((candidate) => candidate.code === clause.questionCode);
	return !!question?.modalities.some((modality) => modality.key === clause.modalityKeys[0]);
}

/**
 * Le formulaire du back-office, valide.
 *
 * Un axe ou un filtre qui ne designe rien est refuse plutot qu ignore : une
 * carte publiee qui ouvrirait l explorateur sur autre chose que ce que dit son
 * titre serait pire qu une carte absente.
 */
export function parseCardForm(form: FormData, questions: readonly SelectionQuestion[]): ParsedCard {
	const title = field(form, 'title');
	const comment = field(form, 'comment');
	const xCode = field(form, 'x');
	const yCode = field(form, 'y') || null;
	const filters = form
		.getAll(PARAM_FILTER)
		.filter((value): value is string => typeof value === 'string' && value !== '');

	if (!title) return { ok: false, message: 'Donnez un titre à ce croisement.' };
	if (title.length > TITLE_MAX) {
		return { ok: false, message: `Le titre dépasse ${TITLE_MAX} caractères.` };
	}
	if (comment.length > COMMENT_MAX) {
		return { ok: false, message: `Le commentaire dépasse ${COMMENT_MAX} caractères.` };
	}

	const known = (code: string) => questions.some((question) => question.code === code);
	if (!known(xCode)) return { ok: false, message: 'Choisissez la question à afficher.' };
	if (yCode !== null && (!known(yCode) || yCode === xCode)) {
		return { ok: false, message: 'Le croisement doit porter sur une autre question.' };
	}
	if (filters.some((value) => !validFilter(value, questions))) {
		return { ok: false, message: "Un filtre ne correspond à aucune réponse de l'enquête." };
	}

	return {
		ok: true,
		value: {
			title,
			comment: comment || null,
			chart: resolveChart(field(form, 'chart'), yCode ? 'crosstab' : 'distribution').key,
			xCode,
			yCode,
			filters: { [PARAM_FILTER]: [...new Set(filters)] }
		}
	};
}

/** L adresse de l explorateur qui rejoue une carte, sans le `?`. */
export function cardSearch(
	card: Pick<StoredCard, 'chart' | 'xCode' | 'yCode' | 'filters'>
): string {
	return exploreSearch({
		x: card.xCode,
		y: card.yCode,
		z: null,
		chart: card.chart,
		includeNonResponses: true,
		filters: parseFilterValues(readCardFilters(card.filters)),
		sort: null,
		basis: null,
		weighted: false
	});
}

/** Une carte telle que le public la lit. */
export interface PublicCard {
	readonly id: string;
	readonly title: string;
	readonly comment: string | null;
	readonly question: string;
	readonly crossedWith: string | null;
	/** Les filtres en clair : « Région : Bretagne ». */
	readonly filters: readonly string[];
	readonly search: string;
}

function filterLabel(value: string, questions: readonly SelectionQuestion[]): string | null {
	const [clause] = parseFilterValues([value]);
	const question = questions.find((candidate) => candidate.code === clause?.questionCode);
	const modality = question?.modalities.find((item) => item.key === clause?.modalityKeys[0]);
	return question && modality ? `${question.label} : ${modality.label}` : null;
}

/**
 * Les cartes d une enquete, en clair.
 *
 * Une carte dont une question a disparu n est pas publiee : son lien ouvrirait
 * l explorateur sur une autre question que celle de son titre. Le back-office
 * empeche deja de supprimer une question qui porte une carte ; ceci tient
 * meme si la base a ete modifiee autrement.
 */
export function describeCards(
	cards: readonly StoredCard[],
	questions: readonly SelectionQuestion[]
): PublicCard[] {
	const labelOf = (code: string | null) =>
		questions.find((question) => question.code === code)?.label ?? null;

	return cards.flatMap((card) => {
		const question = labelOf(card.xCode);
		const crossedWith = labelOf(card.yCode);
		if (!question || (card.yCode !== null && !crossedWith)) return [];

		const filters = readCardFilters(card.filters).map((value) => filterLabel(value, questions));
		if (filters.some((label) => label === null)) return [];

		return [
			{
				id: card.id,
				title: card.title,
				comment: card.comment,
				question,
				crossedWith,
				filters: filters as string[],
				search: cardSearch(card)
			}
		];
	});
}

/** Les valeurs proposees dans la liste des filtres du formulaire. */
export function filterChoices(questions: readonly SelectionQuestion[]) {
	return questions.map((question) => ({
		label: question.label,
		options: question.modalities.map((modality) => ({
			value: filterValue(question.code, modality.key),
			label: modality.label
		}))
	}));
}
