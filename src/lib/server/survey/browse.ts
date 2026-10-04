import {
	NON_RESPONSE_KEY,
	NON_RESPONSE_LABEL,
	type ModalityDescriptor
} from '$lib/shared/questions';
import { orderModalities } from './aggregate';

/**
 * Consultation des reponses au back-office.
 *
 * Ce n'est PAS une page publique : rien n'y passe par le seuil de k-anonymat.
 * L'equipe qui pilote la collecte voit ses propres comptages, repondant par
 * repondant ; masquer une case a celle qui a saisi la reponse n'anonymiserait
 * personne. Tout ce qui sort vers le public continue de passer par
 * `aggregate.ts` et `anonymity.ts`.
 *
 * Fonctions pures : la page lit la base, ce module met en forme.
 */

/** Une question telle que la consultation la decrit. */
export interface BrowseQuestion {
	readonly id: string;
	readonly code: string;
	readonly label: string;
	/** Modalites declarees, dans l'ordre du registre de types. */
	readonly modalities: readonly ModalityDescriptor[];
}

/** Une reponse elementaire, telle que la base la rend. */
export interface BrowseAnswer {
	readonly questionId: string;
	readonly modalityKey: string;
	readonly valueNumber: number | null;
	readonly valueText: string | null;
}

/** Une case du tableau des reponses. */
export interface BrowseCell {
	readonly text: string;
	/** Non-reponse declaree : la case se lit en retrait, elle ne disparait pas. */
	readonly isNonResponse: boolean;
	/** Aucune ligne pour cette question : le repondant ne l'a pas vue passer. */
	readonly missing: boolean;
}

/**
 * Le texte d'une reponse elementaire.
 *
 * La valeur saisie l'emporte quand il y en a une (un nombre exact, un texte
 * libre) : c'est elle que l'equipe veut relire, la tranche n'en est que le
 * classement. A defaut, le libelle de la modalite, et a defaut encore la cle.
 */
function answerText(answer: BrowseAnswer, labels: ReadonlyMap<string, string>): string {
	if (answer.valueText !== null && answer.valueText !== '') return answer.valueText;
	if (answer.valueNumber !== null) return String(answer.valueNumber);
	return labels.get(answer.modalityKey) ?? answer.modalityKey;
}

function labelsOf(question: BrowseQuestion): Map<string, string> {
	const labels = new Map(question.modalities.map((modality) => [modality.key, modality.label]));
	if (!labels.has(NON_RESPONSE_KEY)) labels.set(NON_RESPONSE_KEY, NON_RESPONSE_LABEL);
	return labels;
}

function isNonResponse(question: BrowseQuestion, key: string): boolean {
	if (key === NON_RESPONSE_KEY) return true;
	return question.modalities.some((modality) => modality.key === key && modality.isNonResponse);
}

/**
 * Les cases d'un repondant, une par question, dans l'ordre des questions.
 *
 * Un choix multiple rend plusieurs valeurs : elles sont jointes par un
 * point-virgule, comme dans l'export brut.
 */
export function responseCells(
	questions: readonly BrowseQuestion[],
	answers: readonly BrowseAnswer[]
): BrowseCell[] {
	return questions.map((question) => {
		const own = answers.filter((answer) => answer.questionId === question.id);
		if (own.length === 0) return { text: '', isNonResponse: false, missing: true };

		const labels = labelsOf(question);
		return {
			text: own.map((answer) => answerText(answer, labels)).join(' ; '),
			isNonResponse: own.every((answer) => isNonResponse(question, answer.modalityKey)),
			missing: false
		};
	});
}

/** Une ligne du decompte d'une question. */
export interface TallyRow {
	readonly key: string;
	readonly label: string;
	readonly count: number;
	/** Part des repondants de l'enquete. Depasse 100 % au total sur un choix multiple. */
	readonly share: number;
	readonly isNonResponse: boolean;
}

export interface QuestionTally {
	readonly rows: readonly TallyRow[];
	/** Repondants sans aucune ligne pour cette question. */
	readonly missing: number;
}

/**
 * Le decompte brut d'une question.
 *
 * Un repondant qui coche deux fois la meme case ne compte qu'une fois, comme
 * dans l'agregation publique. La base des parts est le nombre total de
 * repondants de l'enquete, pas le nombre de reponses : c'est la seule qui
 * reste juste sur un choix multiple, et elle fait voir les repondants qui
 * n'ont pas vu passer la question.
 */
export function tallyQuestion(
	question: BrowseQuestion,
	rows: readonly { readonly responseId: string; readonly modalityKey: string }[],
	totalResponses: number
): QuestionTally {
	const seen = new Set<string>();
	const respondents = new Set<string>();
	const counts = new Map<string, number>();

	for (const row of rows) {
		respondents.add(row.responseId);
		const signature = `${row.responseId}\u0000${row.modalityKey}`;
		if (seen.has(signature)) continue;
		seen.add(signature);
		counts.set(row.modalityKey, (counts.get(row.modalityKey) ?? 0) + 1);
	}

	const implicit = !question.modalities.some((modality) => modality.key === NON_RESPONSE_KEY);
	const declared = implicit
		? [
				...question.modalities,
				{ key: NON_RESPONSE_KEY, label: NON_RESPONSE_LABEL, isNonResponse: true }
			]
		: question.modalities;

	const ordered = orderModalities(declared, counts.keys()).filter(
		// La non-reponse implicite ne s'affiche que si quelqu'un l'a donnee ; une
		// modalite declaree s'affiche toujours, meme a zero, parce qu'un zero est
		// un resultat.
		(modality) => !implicit || modality.key !== NON_RESPONSE_KEY || counts.has(NON_RESPONSE_KEY)
	);

	return {
		rows: ordered.map((modality) => {
			const count = counts.get(modality.key) ?? 0;
			return {
				key: modality.key,
				label: modality.label,
				count,
				share: totalResponses === 0 ? 0 : count / totalResponses,
				isNonResponse: modality.isNonResponse
			};
		}),
		missing: Math.max(0, totalResponses - respondents.size)
	};
}

/** Une page de resultats, bornee. */
export interface PageWindow {
	readonly page: number;
	readonly pageCount: number;
	readonly skip: number;
	readonly take: number;
}

/**
 * Borne la page demandee dans l'URL.
 *
 * Une valeur illisible ou hors limites retombe sur la page la plus proche
 * plutot que sur une erreur : un lien garde apres une reinitialisation doit
 * encore ouvrir quelque chose.
 */
export function pageWindow(requested: string | null, total: number, size: number): PageWindow {
	const pageCount = Math.max(1, Math.ceil(total / size));
	const parsed = Number.parseInt(requested ?? '', 10);
	const page = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), pageCount) : 1;
	return { page, pageCount, skip: (page - 1) * size, take: size };
}

/** Filtre « repondants ayant donne telle modalite a telle question ». */
export interface BrowseFilter {
	readonly questionId: string;
	readonly questionCode: string;
	readonly questionLabel: string;
	readonly modalityKey: string;
	readonly modalityLabel: string;
}

/**
 * Lit le filtre de l'URL (`?q=<code>&m=<modalite>`).
 *
 * Une question inconnue annule le filtre, sans erreur. Une modalite non
 * declaree est acceptee telle quelle : une tranche numerique ou une valeur
 * d'echelle n'est pas enumeree a l'avance, et le decompte peut y renvoyer.
 */
export function readFilter(
	questions: readonly BrowseQuestion[],
	code: string | null,
	modalityKey: string | null
): BrowseFilter | null {
	if (!code || !modalityKey) return null;

	const question = questions.find((candidate) => candidate.code === code);
	if (!question) return null;

	return {
		questionId: question.id,
		questionCode: question.code,
		questionLabel: question.label,
		modalityKey,
		modalityLabel: labelsOf(question).get(modalityKey) ?? modalityKey
	};
}
