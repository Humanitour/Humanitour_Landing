import { toColumnKey } from '../slug';

/**
 * Contrat du registre des types de question.
 *
 * Ajouter un type de question = ajouter un fichier qui exporte un `QuestionType`
 * et l enregistrer dans `index.ts`. Aucun `switch` ailleurs dans le code, aucune
 * colonne supplementaire en base (AGENTS.md section 2).
 */

/**
 * Cle de modalite de la non-reponse.
 *
 * Ce n est pas un marqueur d absence : c est une modalite de plein droit, comptee
 * comme les autres. Le jour ou elle devient un cas particulier dans le code, elle
 * finit effacee de l ecran — c est precisement le reproche adresse aux instituts
 * (AGENTS.md section 1.2).
 */
export const NON_RESPONSE_KEY = '__non_response__';

/** Libelle par defaut de la non-reponse, surchargeable par une option declaree. */
export const NON_RESPONSE_LABEL = 'Sans réponse';

export interface QuestionOptionLike {
	readonly code: string;
	readonly label: string;
	readonly position: number;
	readonly isNonResponse: boolean;
	readonly color?: string | null;
}

export interface QuestionContext {
	readonly config: Readonly<Record<string, unknown>>;
	readonly options: readonly QuestionOptionLike[];
}

/** Une modalite telle qu elle sera comptee puis affichee. */
export interface ModalityDescriptor {
	readonly key: string;
	readonly label: string;
	readonly isNonResponse: boolean;
	readonly color?: string | null;
}

/** Une valeur normalisee, prete a devenir une ligne `Answer`. */
export interface NormalizedValue {
	readonly modalityKey: string;
	readonly optionCode: string | null;
	readonly valueNumber: number | null;
	readonly valueText: string | null;
}

export type NormalizeResult =
	| { readonly ok: true; readonly values: readonly NormalizedValue[] }
	| { readonly ok: false; readonly reason: string };

export type ConfigResult =
	| { readonly ok: true; readonly config: Record<string, unknown> }
	| { readonly ok: false; readonly reason: string };

export interface QuestionType {
	/** Valeur stockee dans `Question.type`. Jamais renommee : c est un contrat. */
	readonly key: string;
	readonly label: string;
	readonly description: string;

	/** Le type s appuie-t-il sur des `QuestionOption` declarees en base ? */
	readonly usesOptions: boolean;

	/**
	 * Une reponse peut-elle produire plusieurs modalites ?
	 *
	 * L agregation en depend : pour un type multivalue, la base de calcul des
	 * pourcentages est le nombre de repondants, pas le nombre de reponses, et la
	 * somme des parts depasse legitimement 100 %.
	 */
	readonly multiValued: boolean;

	/** Croisable par defaut dans l explorateur. */
	readonly crossable: boolean;

	/**
	 * Les modalites portent-elles un ordre qui leur est propre ?
	 *
	 * Vrai pour une echelle ou des tranches numeriques : « 18-24 » vient avant
	 * « 25-34 », et ce n est pas negociable. Faux pour une liste de choix, ou
	 * l ordre du questionnaire n a pas de sens en soi et ou trier par effectif
	 * rend le resultat lisible.
	 *
	 * L affichage s en sert pour decider s il PEUT reordonner. Trier une echelle
	 * par effectif produit un graphique en dents de scie dont l axe ne veut plus
	 * rien dire.
	 */
	readonly ordered: boolean;

	/** Valide la configuration saisie au back-office. */
	parseConfig(raw: unknown): ConfigResult;

	/** Transforme une valeur brute (cellule de fichier, saisie) en modalites. */
	normalize(raw: unknown, context: QuestionContext): NormalizeResult;

	/** Modalites attendues, dans l ordre d affichage, non-reponse comprise. */
	modalities(context: QuestionContext): readonly ModalityDescriptor[];
}

/**
 * Une valeur brute est-elle vide ?
 *
 * Centralise ici parce que tous les types de question en dependent et qu une
 * divergence entre eux produirait des non-reponses comptees differemment selon
 * la question.
 */
export function isBlank(raw: unknown): boolean {
	if (raw === null || raw === undefined) return true;
	if (typeof raw === 'string') return raw.trim() === '';
	if (typeof raw === 'number') return Number.isNaN(raw);
	if (Array.isArray(raw)) return raw.length === 0;
	return false;
}

/** La valeur normalisee representant une non-reponse. Identique pour tous les types. */
export function nonResponseValue(): NormalizedValue {
	return {
		modalityKey: NON_RESPONSE_KEY,
		optionCode: null,
		valueNumber: null,
		valueText: null
	};
}

/**
 * Le descripteur de modalite de la non-reponse, place en fin de liste.
 *
 * Elle ne designe QUE la question laissee vide. « Je ne sais pas » ou « sans
 * opinion » sont des reponses donnees, et restent des modalites ordinaires
 * (`declaredModalities`) : les fondre ici les faisait disparaitre des
 * resultats des qu on retirait les non-reponses.
 */
export function nonResponseModality(_options: readonly QuestionOptionLike[]): ModalityDescriptor {
	return {
		key: NON_RESPONSE_KEY,
		label: NON_RESPONSE_LABEL,
		isNonResponse: true,
		color: null
	};
}

/**
 * Retrouve l option correspondant a une valeur brute.
 *
 * Trois passes, de la plus stricte a la plus tolerante :
 *
 *   1. le code exact (`sante`) ;
 *   2. le libelle exact, casse et espaces de bord ignores (`La sante`) ;
 *   3. la forme normalisee, sans accents ni ponctuation — et SEULEMENT si elle
 *      ne designe qu une seule option.
 *
 * La troisieme passe existe parce qu un fichier reel ecrit « L ecologie » la ou
 * la modalite s appelle « L'ecologie » : rejeter la ligne pour une apostrophe
 * ferait perdre un entretien mene sur le terrain. Mais elle refuse de choisir
 * quand deux modalites se ressemblent une fois normalisees — deviner
 * l intention de l operateur serait pire que lui signaler l ambiguite.
 */
export function findOption(
	options: readonly QuestionOptionLike[],
	raw: string
): QuestionOptionLike | null {
	const trimmed = raw.trim();
	const lower = trimmed.toLowerCase();

	const exact = options.find(
		(option) => option.code.toLowerCase() === lower || option.label.trim().toLowerCase() === lower
	);
	if (exact) return exact;

	const needle = toColumnKey(trimmed);
	if (needle === '') return null;

	const loose = options.filter(
		(option) => toColumnKey(option.code) === needle || toColumnKey(option.label) === needle
	);

	return loose.length === 1 ? loose[0]! : null;
}

/** Modalites issues des options declarees, « Je ne sais pas » compris, triees par position. */
export function declaredModalities(
	options: readonly QuestionOptionLike[]
): readonly ModalityDescriptor[] {
	return options
		.slice()
		.sort((a, b) => a.position - b.position)
		.map((option) => ({
			key: option.code,
			label: option.label,
			isNonResponse: false,
			color: option.color ?? null
		}));
}

/** Premier nombre d un libelle, `NaN` s il n en porte pas. */
export function leadingNumber(label: string): number {
	return Number.parseFloat(/\d+(?:[.,]\d+)?/.exec(label)?.[0]?.replace(',', '.') ?? '');
}

/** Toutes les modalites portent un nombre : ce sont des tranches, qui ont un ordre. */
export function hasNumericLabels(modalities: readonly { readonly label: string }[]): boolean {
	return (
		modalities.length > 1 &&
		modalities.every((modality) => Number.isFinite(leadingNumber(modality.label)))
	);
}
