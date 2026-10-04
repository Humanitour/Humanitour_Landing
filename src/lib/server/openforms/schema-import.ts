import { getFieldType } from '$lib/shared/openforms/fields';
import { OTHER_MODALITY_CODE, OTHER_MODALITY_LABEL } from '$lib/shared/openforms/other';
import type { OpenformsField } from '$lib/shared/openforms/types';
import { toColumnKey } from '$lib/shared/slug';
import { detectIdentifyingColumns } from '../normalize/identifying';

/** Motif rendu pour un champ ecarte a la main. */
export const IGNORED_REASON = 'écarté au back-office';

/**
 * Ajoute une cle a la liste des champs ecartes, sans doublon.
 *
 * Une liste et non un ensemble parce que c'est ce que stocke la colonne ;
 * l'ordre d'ecart est garde, c'est celui dans lequel l'ecran les nomme.
 */
export function withIgnoredKey(ignored: readonly string[], key: string): string[] {
	return ignored.includes(key) ? [...ignored] : [...ignored, key];
}

/** Retire des cles de la liste des champs ecartes : retablies, ou reliees a la main. */
export function withoutIgnoredKeys(ignored: readonly string[], keys: Iterable<string>): string[] {
	const removed = new Set(keys);
	return ignored.filter((key) => !removed.has(key));
}

/**
 * Creation des questions a partir du formulaire distant.
 *
 * Openforms porte deja le questionnaire : ses champs, leurs libelles, leurs
 * modalites. Les ressaisir ici a la main, c'est recopier vingt-six fois une
 * information qui existe, et se tromper une fois sur vingt-six.
 *
 * Ce module ne fait que PLANIFIER : il rend les questions a creer et les
 * champs ecartes avec leur motif. Il n'ecrit rien, ne lit ni la base ni le
 * reseau, et se teste donc sans l'un ni l'autre.
 *
 * Quatre regles le gouvernent.
 *
 * 1. Il ne comble que les trous. Un champ deja relie a une question n'est pas
 *    retouche : relancer l'import deux fois de suite ne cree rien la seconde
 *    fois, et ne defait jamais le travail d'un operateur.
 * 2. Il ecarte plutot que d'approximer. Un type sans equivalent croisable
 *    (grille, date) n'engendre pas une question bancale : il est ecarte, et le
 *    motif est rendu pour que l'operateur le lise.
 * 3. Il ne recree pas un champ ecarte au back-office. Supprimer une question
 *    inutile ne servirait a rien si la reprise suivante la ramenait : le champ
 *    est nomme parmi les ecarts, et se retablit depuis l'ecran de liaison.
 * 4. Il ecarte tout ce qui ressemble a une donnee identifiante, par son TYPE
 *    comme par son LIBELLE. Le controle par libelle n'est pas un doublon du
 *    controle de `normalize/identifying` : celui-la ne voit que les cles, et le
 *    builder d'Openforms engendre des cles opaques (« champ_mrkpxig1_2 »).
 *    Aucun motif ne peut y reconnaitre « Nom et prenom ». Ici, le libelle est
 *    disponible, et c'est le dernier endroit ou un champ nominatif peut etre
 *    arrete avant d'avoir une colonne en base.
 */

export interface OptionDraft {
	readonly code: string;
	readonly label: string;
	readonly position: number;
	readonly isNonResponse: boolean;
	readonly color: string | null;
}

export interface QuestionDraft {
	readonly openformsKey: string;
	readonly code: string;
	readonly label: string;
	/** Cle du registre `shared/questions`, dictee par le type de champ distant. */
	readonly type: string;
	readonly options: readonly OptionDraft[];
}

export interface SkippedField {
	readonly key: string;
	readonly label: string;
	readonly reason: string;
}

/** Des modalites a ajouter a une question qui existe deja. */
export interface OptionAddition {
	readonly questionCode: string;
	readonly questionLabel: string;
	readonly options: readonly OptionDraft[];
}

export interface ImportPlan {
	readonly drafts: readonly QuestionDraft[];
	/**
	 * Modalites manquantes sur les questions deja reliees.
	 *
	 * Un formulaire vit : on y ajoute une reponse possible, on y coche « Autre »
	 * apres coup. Sans cette reconciliation, la question restait figee dans
	 * l'etat du formulaire au jour de sa reprise, et chaque reponse portant la
	 * modalite nouvelle etait refusee — le repondant entier avec elle.
	 *
	 * L'inverse n'est pas vrai : une modalite retiree du formulaire n'est jamais
	 * supprimee ici. Des reponses la portent peut-etre deja, et les effacer
	 * reecrirait le passe.
	 */
	readonly additions: readonly OptionAddition[];
	readonly skipped: readonly SkippedField[];
}

/** Une question deja presente dans l'enquete. */
export interface ExistingQuestion {
	readonly code: string;
	readonly label?: string;
	readonly openformsKey: string | null;
	/** Codes de ses modalites actuelles. */
	readonly optionCodes?: readonly string[];
}

/**
 * Les modalites qui disent « je ne reponds pas ».
 *
 * Volontairement etroite. « Aucun » ou « Rien de tout cela » sont des reponses
 * a part entiere dans un sondage d'opinion, pas des non-reponses : les marquer
 * ferait disparaitre un choix reel dans la colonne des abstentions, ce qui est
 * exactement le reproche que l'institut fait aux autres (AGENTS.md section
 * 1.2). Une modalite mal classee reste corrigeable a l'ecran.
 */
const NON_RESPONSE_PATTERNS: readonly RegExp[] = [
	/\bne\s+se\s+prononce\s+pas\b/i,
	/\bsans\s+(opinion|avis|r[eé]ponse)\b/i,
	/\bne\s+(sais|souhaite)\s+pas\b/i,
	/\bpr[eé]f[eè]re\s+ne\s+pas\s+r[eé]pondre\b/i,
	/\brefus\s+de\s+r[eé]pondre\b/i,
	/^nsp$/i
];

function looksLikeNonResponse(label: string): boolean {
	return NON_RESPONSE_PATTERNS.some((pattern) => pattern.test(label.trim()));
}

/**
 * Le code d'une modalite vient de la VALEUR distante, pas de son libelle.
 *
 * C'est elle qui arrive dans les soumissions (`toCell` ne traduit rien), et
 * c'est sur elle que `findOption` retombe. Un code tire du libelle laisserait
 * « opt1 » sans correspondance, et chaque reponse serait rejetee pour
 * « modalite inconnue ».
 *
 * Pas de troncature, pour la meme raison : un code coupe ne se retrouve plus.
 */
function optionCode(value: string, label: string): string {
	return toColumnKey(value) || toColumnKey(label);
}

function planOptions(field: OpenformsField): readonly OptionDraft[] {
	const taken = new Set<string>();
	const options: OptionDraft[] = [];

	for (const option of field.options) {
		const label = option.label.trim();
		const base = optionCode(option.value, label);
		if (base === '' || taken.has(base)) continue;

		taken.add(base);
		options.push({
			code: base,
			label: label === '' ? option.value : label,
			position: options.length,
			isNonResponse: looksLikeNonResponse(label),
			color: option.color ?? null
		});
	}

	// « Autre » n'est pas une option declaree chez Openforms : c'est une case a
	// cocher du champ, qui soumet `__other__`. Sans modalite pour la recevoir,
	// la reponse est refusee et le repondant entier avec elle
	// (`shared/openforms/other`).
	if (field.allowOther && !taken.has(OTHER_MODALITY_CODE)) {
		options.push({
			code: OTHER_MODALITY_CODE,
			label: OTHER_MODALITY_LABEL,
			position: options.length,
			isNonResponse: false,
			color: null
		});
	}

	return options;
}

/**
 * Le code d'une question vient de son LIBELLE, comme au back-office.
 *
 * Il entre dans les permaliens de croisement (`?x=region`) : la cle distante,
 * opaque, y serait illisible et definitive.
 */
function questionCode(label: string, taken: Set<string>): string {
	const base = toColumnKey(label).slice(0, 40) || 'question';
	let code = base;
	for (let suffix = 2; taken.has(code); suffix += 1) code = `${base}_${suffix}`;
	return code;
}

/** Les modalites du champ que la question deja reliee ne connait pas encore. */
function missingOptions(question: ExistingQuestion, field: OpenformsField): OptionAddition | null {
	const known = new Set(question.optionCodes ?? []);
	const missing = planOptions(field).filter((option) => !known.has(option.code));
	if (missing.length === 0) return null;

	return {
		questionCode: question.code,
		questionLabel: question.label ?? question.code,
		options: missing
	};
}

export function planQuestionsFromForm(
	fields: readonly OpenformsField[],
	existing: readonly ExistingQuestion[],
	ignoredKeys: readonly string[] = []
): ImportPlan {
	const ignored = new Set(ignoredKeys);
	const codes = new Set(existing.map((question) => question.code));
	const byRemoteKey = new Map(
		existing.flatMap((question) =>
			question.openformsKey ? [[question.openformsKey, question] as const] : []
		)
	);

	const drafts: QuestionDraft[] = [];
	const additions: OptionAddition[] = [];
	const skipped: SkippedField[] = [];

	for (const field of fields) {
		const label = field.label.trim();
		const report = (reason: string) => skipped.push({ key: field.key, label, reason });

		// Deja relie : la question n'est pas recreee, mais ses modalites sont
		// reconciliees. Un second passage ne signale rien quand il n'y a rien a
		// ajouter, sans quoi la routine passerait pour un incident.
		const already = byRemoteKey.get(field.key);
		if (already) {
			const addition = missingOptions(already, field);
			if (addition) additions.push(addition);
			continue;
		}

		// Apres le controle « deja relie » : une question reliee a la main a ce
		// champ l'emporte sur l'ecart, et ses modalites restent reconciliees.
		if (ignored.has(field.key)) {
			report(IGNORED_REASON);
			continue;
		}

		const definition = getFieldType(field.type);
		if (!definition) {
			report(`type de champ inconnu de ce dépôt (« ${field.type} »)`);
			continue;
		}

		// Le controle d'identite passe AVANT celui de la reponse portee : les
		// types identifiants du registre (courriel, adresse, signature, fichier)
		// ne portent volontairement aucune reponse, et les taire ici cacherait a
		// l'operateur que le formulaire distant les recueille quand meme.
		if (definition.identifying) {
			report(`champ ${definition.label.toLowerCase()} : donnée directement identifiante`);
			continue;
		}

		// Titres et blocs de texte : ils s'affichent, ils ne portent pas de
		// reponse. Les signaler noierait les vrais ecarts.
		if (!definition.carriesAnswer) continue;

		if (detectIdentifyingColumns([label]).length > 0) {
			report('le libellé annonce une donnée directement identifiante');
			continue;
		}

		if (definition.questionType === null) {
			report(`aucun type de question ne reçoit un champ ${definition.label.toLowerCase()}`);
			continue;
		}

		const code = questionCode(label, codes);
		codes.add(code);

		drafts.push({
			openformsKey: field.key,
			code,
			label: label === '' ? field.key : label,
			type: definition.questionType,
			options: planOptions(field)
		});
	}

	return { drafts, additions, skipped };
}
