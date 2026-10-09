import { z } from 'zod';
import { getQuestionType, NON_RESPONSE_KEY, type ModalityDescriptor } from '$lib/shared/questions';
import { protectDistribution } from './anonymity';
import {
	DEFAULT_MAX_ITERATIONS,
	DEFAULT_MAX_WEIGHT,
	DEFAULT_MIN_WEIGHT,
	DEFAULT_TOLERANCE,
	normalizeTargets,
	type WeightingDiagnostics,
	type WeightingSettings,
	type WeightingUnit,
	type WeightingVariable
} from './weighting';

/**
 * Preparation d un redressement : ce qui separe la saisie d un analyste du
 * calage lui-meme (`weighting.ts`).
 *
 * Sans acces a la base, pour la meme raison que `explore.ts` : ce qui decide
 * d un chiffre publie doit se tester sans serveur.
 */

/**
 * D ou viennent les cibles d une variable, quand elles viennent de l Insee.
 *
 * Ecrit avec la variable, donc versionne avec elle dans le journal d audit.
 * `censusTargets` garde les parts telles que le recensement les donnait, et
 * `edited` dit si l analyste les a retouchees : une marge « Insee » corrigee a
 * la main doit pouvoir se reconnaitre comme telle.
 */
export interface MarginOrigin {
	readonly provider: 'insee-melodi';
	readonly datasets: readonly string[];
	readonly period: string;
	readonly geo: string;
	readonly dimension: string;
	readonly fetchedAt: string;
	readonly censusTargets: Readonly<Record<string, number>>;
	readonly edited: boolean;
}

/** Une variable de calage telle qu elle est ecrite dans `SurveyWeighting.variables`. */
export interface StoredVariable {
	readonly questionCode: string;
	/** Parts cibles entre 0 et 1, de somme 1, par cle de modalite. */
	readonly targets: Readonly<Record<string, number>>;
	/** Absent pour des marges saisies a la main. */
	readonly origin?: MarginOrigin;
}

const originSchema = z.object({
	provider: z.literal('insee-melodi'),
	datasets: z.array(z.string()),
	period: z.string(),
	geo: z.string(),
	dimension: z.string(),
	fetchedAt: z.string(),
	censusTargets: z.record(z.string(), z.number())
});

const variablesSchema = z.array(
	z.object({
		questionCode: z.string().min(1),
		targets: z.record(z.string(), z.number()),
		origin: originSchema.extend({ edited: z.boolean() }).optional()
	})
);

/** Lit la colonne JSON. Une valeur illisible vaut « aucune variable », jamais une exception. */
export function readVariables(raw: unknown): StoredVariable[] {
	const parsed = variablesSchema.safeParse(raw);
	return parsed.success ? parsed.data : [];
}

/**
 * Les marges avec lesquelles le dernier calcul a tourne, lues dans son
 * diagnostic. `null` pour un calcul anterieur a leur enregistrement.
 */
export function readUsedVariables(diagnostics: unknown): StoredVariable[] | null {
	if (typeof diagnostics !== 'object' || diagnostics === null || !('variables' in diagnostics)) {
		return null;
	}
	return readVariables(diagnostics.variables);
}

/** Memes variables, memes cibles a un demi-centieme de point pres. La provenance ne compte pas. */
export function sameMargins(a: readonly StoredVariable[], b: readonly StoredVariable[]): boolean {
	if (a.length !== b.length) return false;

	return a.every((variable) => {
		const other = b.find((candidate) => candidate.questionCode === variable.questionCode);
		if (!other) return false;
		const keys = new Set([...Object.keys(variable.targets), ...Object.keys(other.targets)]);
		return [...keys].every(
			(key) => Math.abs((variable.targets[key] ?? 0) - (other.targets[key] ?? 0)) <= SUM_TOLERANCE
		);
	});
}

/**
 * Parts arrondies a `decimals` decimales de pourcentage, de somme EXACTEMENT 100.
 *
 * Methode du plus fort reste : on tronque, puis on distribue les centiemes
 * manquants aux parts dont le reste est le plus grand. Sans elle, trois tiers
 * arrondis feraient 99,99 %, et le formulaire, qui exige 100 %, refuserait la
 * proposition de l Insee.
 */
export function roundPercentages(shares: readonly number[], decimals = 2): number[] {
	const scale = 10 ** decimals;
	const total = shares.reduce((sum, share) => sum + share, 0);
	if (total <= 0) return shares.map(() => 0);

	const exact = shares.map((share) => (share / total) * 100 * scale);
	const floors = exact.map(Math.floor);
	let missing = 100 * scale - floors.reduce((sum, value) => sum + value, 0);

	const order = exact
		.map((value, index) => ({ index, rest: value - Math.floor(value) }))
		.sort((a, b) => b.rest - a.rest);

	for (const { index } of order) {
		if (missing <= 0) break;
		floors[index]! += 1;
		missing -= 1;
	}

	return floors.map((value) => value / scale);
}

/**
 * Le diagnostic tel qu il est ecrit en base.
 *
 * Les champs ajoutes le 28 septembre 2026 (effet de plan, trace, parametres)
 * sont facultatifs : un calcul plus ancien se relit, et ce qui peut se deduire
 * de ce qu il contient est recalcule plutot que laisse vide.
 */
const diagnosticsSchema = z.object({
	iterations: z.number(),
	converged: z.boolean(),
	maxDeviation: z.number(),
	minWeight: z.number(),
	maxWeight: z.number(),
	effectiveSampleSize: z.number(),
	designEffect: z.number().optional(),
	coefficientOfVariation: z.number().optional(),
	weightRatio: z.number().nullable().optional(),
	atBounds: z.number().optional(),
	respondents: z.number(),
	warnings: z.array(
		z.object({ questionCode: z.string(), modalityKey: z.string(), reason: z.string() })
	),
	history: z.array(z.object({ iteration: z.number(), maxDeviation: z.number() })).optional(),
	settings: z
		.object({
			tolerance: z.number(),
			maxIterations: z.number(),
			trim: z.boolean(),
			minWeight: z.number(),
			maxWeight: z.number()
		})
		.nullable()
		.optional()
});

export function readDiagnostics(raw: unknown): WeightingDiagnostics | null {
	const parsed = diagnosticsSchema.safeParse(raw);
	if (!parsed.success) return null;

	const data = parsed.data;
	// n / n_eff : l effet de plan se deduit des deux chiffres qu un ancien
	// calcul a toujours enregistres.
	const designEffect =
		data.designEffect ??
		(data.effectiveSampleSize > 0 ? data.respondents / data.effectiveSampleSize : 1);

	return {
		...data,
		designEffect,
		coefficientOfVariation: data.coefficientOfVariation ?? Math.sqrt(Math.max(0, designEffect - 1)),
		weightRatio:
			data.weightRatio !== undefined
				? data.weightRatio
				: data.minWeight > 0
					? data.maxWeight / data.minWeight
					: null,
		atBounds: data.atBounds ?? 0,
		history: data.history ?? [],
		settings: data.settings ?? null
	};
}

/**
 * Une question peut-elle porter un calage ?
 *
 * Il faut UNE modalite par repondant : le calage range chaque personne dans une
 * case de la marge. Une question a choix multiple mettrait la meme personne
 * dans trois cases, et sa marge n a pas d equivalent dans une source de
 * population. Le texte libre, lui, n a pas de modalites enumerables.
 */
export function canCalibrateOn(type: string): boolean {
	const definition = getQuestionType(type);
	return !!definition && definition.crossable && !definition.multiValued;
}

/** Les modalites qui recoivent une cible : tout sauf la non-reponse. */
export function targetModalities(
	modalities: readonly ModalityDescriptor[]
): readonly ModalityDescriptor[] {
	return modalities.filter((modality) => !modality.isNonResponse);
}

export function toWeightingVariables(stored: readonly StoredVariable[]): WeightingVariable[] {
	return stored
		.map((variable) => ({
			questionCode: variable.questionCode,
			targets: normalizeTargets(new Map(Object.entries(variable.targets)))
		}))
		.filter((variable) => variable.targets.size > 0);
}

export interface CalibrationAnswer {
	readonly responseId: string;
	readonly questionCode: string;
	readonly modalityKey: string;
}

/**
 * Les repondants, reduits a leur modalite sur chaque variable de calage.
 *
 * La non-reponse n est PAS une modalite de calage : aucune source de population
 * ne dit combien de Francais « ne disent pas leur age ». Le repondant qui n a
 * pas repondu garde donc son poids sur cette variable, au lieu d etre range
 * dans une case qu aucune cible ne peut atteindre.
 */
export function buildUnits(
	responseIds: readonly string[],
	answers: readonly CalibrationAnswer[]
): WeightingUnit[] {
	const byResponse = new Map<string, Map<string, string>>(
		responseIds.map((id) => [id, new Map<string, string>()])
	);

	for (const answer of answers) {
		if (answer.modalityKey === NON_RESPONSE_KEY) continue;
		const modalities = byResponse.get(answer.responseId);
		if (!modalities || modalities.has(answer.questionCode)) continue;
		modalities.set(answer.questionCode, answer.modalityKey);
	}

	return [...byResponse].map(([id, modalities]) => ({ id, modalities }));
}

export interface CalibrationQuestion {
	readonly code: string;
	readonly label: string;
	readonly modalities: readonly ModalityDescriptor[];
}

/**
 * Tolerance sur la somme des parts saisies : un demi-centieme de point.
 *
 * La somme doit faire EXACTEMENT 100 %. Une version precedente acceptait
 * 99,8 % et normalisait, au motif que des pourcentages recopies sont arrondis.
 * Depuis que l ecran affiche le total en direct et que les marges peuvent
 * venir de l Insee a la decimale pres, l excuse ne tient plus : normaliser
 * 99,8 % deplace chaque cible sans que personne ne l ait decide. La marge
 * laissee ici n absorbe que l arithmetique flottante de deux decimales.
 */
const SUM_TOLERANCE = 0.00005;

/** Champ cache portant la proposition du recensement pour une question. */
export function originField(questionCode: string): string {
	return `origine:${questionCode}`;
}

export type ParsedTargets =
	| { readonly ok: true; readonly variables: StoredVariable[] }
	| { readonly ok: false; readonly message: string };

/** « 12,5 » ou « 12.5 » ou « 12,5 % ». Vide = pas de cible. */
function readPercent(raw: FormDataEntryValue | null): number | null {
	if (typeof raw !== 'string') return null;
	const cleaned = raw.replace('%', '').replace(',', '.').trim();
	if (cleaned === '') return null;
	const value = Number(cleaned);
	return Number.isFinite(value) ? value : Number.NaN;
}

export function targetField(questionCode: string, modalityKey: string): string {
	return `cible:${questionCode}:${modalityKey}`;
}

/**
 * Lit les marges saisies dans le formulaire du back-office.
 *
 * Les champs sont `variable` (une valeur par question retenue) et
 * `cible:<code>:<modalite>` en pourcentage. Les parts sont ecrites
 * normalisees : ce qui est en base est exactement ce qui sert au calcul.
 */
export function parseTargetsForm(
	form: FormData,
	candidates: readonly CalibrationQuestion[]
): ParsedTargets {
	const selected = new Set(form.getAll('variable').map(String));
	const variables: StoredVariable[] = [];

	for (const question of candidates) {
		if (!selected.has(question.code)) continue;

		const parsed = readQuestionTargets(form, question);
		if (!parsed.ok) return parsed;
		variables.push(parsed.variable);
	}

	if (variables.length === 0) {
		return { ok: false, message: 'Retenez au moins une variable de calage.' };
	}

	return { ok: true, variables };
}

function readQuestionTargets(
	form: FormData,
	question: CalibrationQuestion
): { ok: true; variable: StoredVariable } | { ok: false; message: string } {
	const raw = new Map<string, number>();

	for (const modality of targetModalities(question.modalities)) {
		const value = readPercent(form.get(targetField(question.code, modality.key)));
		if (value === null) continue;
		if (Number.isNaN(value) || value < 0 || value > 100) {
			return {
				ok: false,
				message: `« ${question.label} », modalité « ${modality.label} » : saisissez un pourcentage entre 0 et 100.`
			};
		}
		raw.set(modality.key, value / 100);
	}

	const sum = [...raw.values()].reduce((acc, share) => acc + share, 0);
	if (Math.abs(sum - 1) > SUM_TOLERANCE) {
		const percent = (sum * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
		return {
			ok: false,
			message: `Les cibles de « ${question.label} » totalisent ${percent} % : la somme doit faire exactement 100 %.`
		};
	}

	const targets = Object.fromEntries(normalizeTargets(raw));
	const origin = readOrigin(form.get(originField(question.code)), targets);

	return {
		ok: true,
		variable: origin
			? { questionCode: question.code, targets, origin }
			: { questionCode: question.code, targets }
	};
}

/**
 * La provenance Insee postee avec le formulaire, confrontee aux cibles saisies.
 *
 * Illisible ou absente : pas de provenance, la variable est tenue pour saisie
 * a la main. Ecart de plus d un demi-centieme de point sur une modalite, ou
 * modalite ajoutee ou retiree : la marge est marquee retouchee.
 */
function readOrigin(
	raw: FormDataEntryValue | null,
	targets: Readonly<Record<string, number>>
): MarginOrigin | null {
	if (typeof raw !== 'string' || raw === '') return null;

	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		return null;
	}

	const parsed = originSchema.safeParse(json);
	if (!parsed.success) return null;

	const census = parsed.data.censusTargets;
	const keys = new Set([...Object.keys(census), ...Object.keys(targets)]);
	const edited = [...keys].some(
		(key) => Math.abs((census[key] ?? 0) - (targets[key] ?? 0)) > SUM_TOLERANCE
	);

	return { ...parsed.data, edited };
}

/** Un nombre saisi, a virgule ou a point, dans un intervalle. `null` sinon. */
function readNumber(form: FormData, name: string, min: number, max: number): number | null {
	const raw = String(form.get(name) ?? '')
		.replace(',', '.')
		.trim();
	const value = Number(raw);
	if (raw === '' || !Number.isFinite(value) || value < min || value > max) return null;
	return value;
}

export type ParsedSettings =
	| {
			readonly ok: true;
			readonly settings: WeightingSettings;
			readonly missingAcknowledged: boolean;
	  }
	| { readonly ok: false; readonly message: string };

/**
 * Les parametres du calcul, tels que saisis dans l onglet « Calcul ».
 *
 * Les bornes ne sont exigees que si la troncature est cochee : sans elle, le
 * calage est un raking ratio pur et les champs de bornes ne servent a rien.
 * Les bornes par defaut sont alors gardees, pour qu une case recochee
 * retrouve des valeurs sensees.
 */
export function parseSettingsForm(form: FormData): ParsedSettings {
	const tolerance = readNumber(form, 'tolerance', 1e-8, 0.05);
	if (tolerance === null) {
		return {
			ok: false,
			message: 'Seuil de convergence : saisissez un nombre entre 0,00000001 et 0,05.'
		};
	}

	const maxIterations = readNumber(form, 'maxIterations', 1, 1000);
	if (maxIterations === null || !Number.isInteger(maxIterations)) {
		return { ok: false, message: 'Itérations : saisissez un nombre entier entre 1 et 1 000.' };
	}

	const trim = form.get('trim') === 'on';
	const minWeight = readNumber(form, 'minWeight', 0.01, 1);
	const maxWeight = readNumber(form, 'maxWeight', 1, 50);
	if (trim && (minWeight === null || maxWeight === null)) {
		return {
			ok: false,
			message:
				'Bornes des poids : la borne basse doit être entre 0,01 et 1, la borne haute entre 1 et 50.'
		};
	}

	return {
		ok: true,
		settings: {
			tolerance,
			maxIterations,
			trim,
			minWeight: minWeight ?? DEFAULT_MIN_WEIGHT,
			maxWeight: maxWeight ?? DEFAULT_MAX_WEIGHT
		},
		missingAcknowledged: form.get('acceptMissing') === 'on'
	};
}

/**
 * Les parametres a proposer dans le formulaire : ceux du dernier calcul, sinon
 * les valeurs par defaut, avec les bornes lues dans leurs colonnes.
 */
export function currentSettings(
	diagnostics: WeightingDiagnostics | null,
	columns: { readonly minWeight: number; readonly maxWeight: number } | null
): WeightingSettings {
	if (diagnostics?.settings) return diagnostics.settings;

	return {
		tolerance: DEFAULT_TOLERANCE,
		maxIterations: DEFAULT_MAX_ITERATIONS,
		trim: true,
		minWeight: columns?.minWeight ?? DEFAULT_MIN_WEIGHT,
		maxWeight: columns?.maxWeight ?? DEFAULT_MAX_WEIGHT
	};
}

/** Ce qui empeche, ou devrait faire hesiter, un calcul sur une variable. */
export interface IntegrityReport {
	readonly questionCode: string;
	readonly label: string;
	/** Repondants sans modalite (non-reponse ou question sautee). */
	readonly missing: number;
	/** Modalites portees par des repondants mais sans cible : bloquant. */
	readonly untargeted: readonly { key: string; label: string; count: number }[];
}

/**
 * Controle d integrite des variables de calage, avant tout calcul.
 *
 * Deux defauts, traites differemment :
 *
 *   - une modalite OBSERVEE sans cible bloque le calcul : ses repondants
 *     garderaient leur poids pendant que les autres sont ramenes a 100 % du
 *     total, et le calage ne pourrait pas converger ;
 *   - une valeur MANQUANTE (le repondant n a pas repondu) n est pas un defaut
 *     de saisie mais un fait du terrain. CALMAR exige des variables de calage
 *     completes ; ici, on ne supprime pas un repondant pour une case vide
 *     (`buildUnits`), il garde son poids sur cette variable. Le calcul exige
 *     donc que l analyste l ait constate, et la note de methode le dit.
 */
export function checkIntegrity(
	units: readonly WeightingUnit[],
	variables: readonly StoredVariable[],
	questions: readonly CalibrationQuestion[]
): IntegrityReport[] {
	return variables.map((variable) => {
		const question = questions.find((candidate) => candidate.code === variable.questionCode);
		const counts = new Map<string, number>();
		let missing = 0;

		for (const unit of units) {
			const key = unit.modalities.get(variable.questionCode);
			if (key === undefined) missing += 1;
			else counts.set(key, (counts.get(key) ?? 0) + 1);
		}

		const untargeted = [...counts]
			.filter(([key]) => !((variable.targets[key] ?? 0) > 0))
			.map(([key, count]) => ({
				key,
				label: question?.modalities.find((modality) => modality.key === key)?.label ?? key,
				count
			}));

		return {
			questionCode: variable.questionCode,
			label: question?.label ?? variable.questionCode,
			missing,
			untargeted
		};
	});
}

/** Le message qui bloque le calcul, ou `null` si rien ne s y oppose. */
export function integrityBlocker(
	reports: readonly IntegrityReport[],
	missingAcknowledged: boolean
): string | null {
	const untargeted = reports.find((report) => report.untargeted.length > 0);
	if (untargeted) {
		const names = untargeted.untargeted
			.map((modality) => `« ${modality.label} » (${modality.count})`)
			.join(', ');
		return `« ${untargeted.label} » : ${names} ont des répondants mais aucune cible. Donnez-leur une part, même petite, ou retirez la variable.`;
	}

	const missing = reports.filter((report) => report.missing > 0);
	if (missing.length > 0 && !missingAcknowledged) {
		const names = missing.map((report) => `« ${report.label} » (${report.missing})`).join(', ');
		return `Valeurs manquantes sur ${names}. Cochez la case qui confirme que ces répondants gardent un poids neutre sur la variable, ou retirez-la du calage.`;
	}

	return null;
}

/**
 * Le redressement tel qu on le publie : tout ce qui a servi a le faire, en
 * libelles lisibles. Page et API en donnent exactement la meme description.
 */
export function describeWeighting(
	weighting: {
		readonly version: number;
		readonly computedAt: Date;
		readonly source: string | null;
		readonly variables: readonly StoredVariable[];
		readonly diagnostics: WeightingDiagnostics | null;
	},
	questions: readonly CalibrationQuestion[]
) {
	const diagnostics = weighting.diagnostics;

	return {
		version: weighting.version,
		computedAt: weighting.computedAt,
		source: weighting.source,
		variables: weighting.variables.map((variable) => {
			const question = questions.find((candidate) => candidate.code === variable.questionCode);
			return {
				code: variable.questionCode,
				label: question?.label ?? variable.questionCode,
				targets: Object.entries(variable.targets).map(([key, share]) => ({
					key,
					label: question?.modalities.find((modality) => modality.key === key)?.label ?? key,
					share
				}))
			};
		}),
		diagnostics: diagnostics && {
			converged: diagnostics.converged,
			maxDeviation: diagnostics.maxDeviation,
			minWeight: diagnostics.minWeight,
			maxWeight: diagnostics.maxWeight,
			effectiveSampleSize: diagnostics.effectiveSampleSize,
			designEffect: diagnostics.designEffect,
			respondents: diagnostics.respondents
		}
	};
}

export type WeightingDescription = ReturnType<typeof describeWeighting>;

/** Une ligne du rapport de calage : ce qu on avait, ce qu on visait, ce qu on a obtenu. */
export interface MarginRow {
	readonly key: string;
	readonly label: string;
	readonly observed: number | null;
	readonly target: number | null;
	readonly weighted: number | null;
}

/**
 * Marges observee, cible et obtenue, pour une variable.
 *
 * C est l ecran que l analyste lit avant de publier : si une modalite reste a
 * trois points de sa cible, il le voit ici, chiffre par chiffre, et non dans un
 * seul indicateur d ecart maximal.
 */
export function marginReport(
	units: readonly WeightingUnit[],
	weights: ReadonlyMap<string, number> | null,
	questionCode: string,
	modalities: readonly ModalityDescriptor[],
	targets: Readonly<Record<string, number>> | null,
	threshold?: number
): { rows: MarginRow[]; unknown: number } {
	const raw = new Map<string, number>();
	const weighted = new Map<string, number>();
	let rawTotal = 0;
	let weightedTotal = 0;
	let unknown = 0;

	for (const unit of units) {
		const key = unit.modalities.get(questionCode);
		if (key === undefined) {
			unknown += 1;
			continue;
		}
		const weight = weights?.get(unit.id) ?? 1;
		raw.set(key, (raw.get(key) ?? 0) + 1);
		weighted.set(key, (weighted.get(key) ?? 0) + weight);
		rawTotal += 1;
		weightedTotal += weight;
	}

	const kept = targetModalities(modalities);
	const hidden = maskedKeys(raw, kept, threshold);

	const rows = kept.map((modality) => {
		const visible = !hidden.has(modality.key);
		return {
			key: modality.key,
			label: modality.label,
			observed: visible && rawTotal > 0 ? (raw.get(modality.key) ?? 0) / rawTotal : null,
			target: targets?.[modality.key] ?? null,
			weighted:
				visible && weights && weightedTotal > 0
					? (weighted.get(modality.key) ?? 0) / weightedTotal
					: null
		};
	});

	return { rows, unknown };
}

/**
 * Les modalites dont la part ne peut pas etre publiee.
 *
 * Une part posee a cote d un effectif publie redonne un compte : sous le seuil,
 * elle se masque comme le compte, dans les deux lectures, et la suppression
 * secondaire de `protectDistribution` empeche de la retrouver par
 * soustraction. Sans seuil, c est l ecran de l analyste, et rien n est masque.
 */
function maskedKeys(
	raw: ReadonlyMap<string, number>,
	modalities: readonly ModalityDescriptor[],
	threshold: number | undefined
): Set<string> {
	if (threshold === undefined) return new Set();

	const table = protectDistribution(
		raw,
		modalities.map((modality) => modality.key),
		threshold
	);
	return new Set(table.cells.filter((cell) => cell.suppressed).map((cell) => cell.xKey));
}
