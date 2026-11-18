/**
 * Protection des effectifs publies.
 *
 * Humanitour collecte des opinions politiques : des donnees sensibles au sens de
 * l article 9 du RGPD. Publier un croisement fin (departement x age x intention de
 * vote) peut suffire a reidentifier une personne.
 *
 * Deux passes, et la seconde est celle qu on oublie presque toujours :
 *
 *   1. Suppression primaire — toute case sous le seuil `k` est masquee.
 *   2. Suppression secondaire — si une ligne ne compte qu une seule case masquee
 *      et que son total est publie, la case masquee se retrouve par soustraction.
 *      On masque donc une seconde case, ou a defaut le total.
 *
 * Masquer sans la seconde passe donne l illusion de la protection, ce qui est pire
 * que de ne rien masquer (AGENTS.md section 4).
 */

export const DEFAULT_K_THRESHOLD = 5;

/**
 * Seuil applicable, par ordre de priorite : surcharge du sondage, reglage
 * global, defaut.
 *
 * Fonction pure, separee de sa lecture en base : c est la regle qui compte, et
 * elle doit etre verifiable sans PostgreSQL. Une valeur de reglage absurde
 * (texte, negatif, nombre a virgule) retombe sur le defaut. Zero est accepte :
 * c'est un choix explicite du back-office, qui publie alors tous les effectifs.
 */
export function pickThreshold(surveyOverride: number | null, settingValue: unknown): number {
	if (isUsableThreshold(surveyOverride)) return surveyOverride;
	if (isUsableThreshold(settingValue)) return settingValue;
	return DEFAULT_K_THRESHOLD;
}

function isUsableThreshold(value: unknown): value is number {
	// 0 est voulu : il leve le masquage (decision tracee a l'audit au reglage).
	return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export interface CountedCell {
	readonly xKey: string;
	readonly yKey: string;
	readonly count: number;
}

export interface ProtectedCell {
	readonly xKey: string;
	readonly yKey: string;
	/** `null` des que la case est masquee. La valeur reelle ne sort jamais du serveur. */
	readonly count: number | null;
	readonly suppressed: boolean;
}

export interface ProtectedTable {
	readonly cells: readonly ProtectedCell[];
	readonly rowTotals: ReadonlyMap<string, number | null>;
	readonly columnTotals: ReadonlyMap<string, number | null>;
	/** Total general. Toujours publie : c est l effectif de l enquete. */
	readonly total: number;
	readonly threshold: number;
	readonly suppressedCount: number;
}

interface WorkingCell {
	readonly xKey: string;
	readonly yKey: string;
	readonly count: number;
	suppressed: boolean;
}

interface Line {
	/** Cle de la modalite portant la ligne ou la colonne. */
	readonly key: string;
	/**
	 * Cle namespacee pour le suivi des totaux masques.
	 *
	 * Croiser une question avec une autre qui partage ses codes de modalite
	 * (« oui » / « non » sur les deux axes) ferait autrement collision entre le
	 * total de la ligne « oui » et celui de la colonne « oui ».
	 */
	readonly totalKey: string;
	readonly cells: WorkingCell[];
}

function keyOf(xKey: string, yKey: string): string {
	return `${xKey}\u0000${yKey}`;
}

function groupBy(
	cells: WorkingCell[],
	namespace: 'row' | 'column',
	pick: (cell: WorkingCell) => string
): Line[] {
	const groups = new Map<string, WorkingCell[]>();

	for (const cell of cells) {
		const key = pick(cell);
		const bucket = groups.get(key);
		if (bucket) {
			bucket.push(cell);
			continue;
		}
		groups.set(key, [cell]);
	}

	return [...groups].map(([key, lineCells]) => ({
		key,
		totalKey: `${namespace}\u0000${key}`,
		cells: lineCells
	}));
}

/**
 * Choisit la case a masquer en second.
 *
 * On prend la plus petite : c est celle dont la disparition coute le moins
 * d information au lecteur.
 */
function pickSecondary(line: Line): WorkingCell | null {
	let candidate: WorkingCell | null = null;

	for (const cell of line.cells) {
		if (cell.suppressed) continue;
		if (candidate === null || cell.count < candidate.count) candidate = cell;
	}

	return candidate;
}

/**
 * Applique la suppression secondaire a une ligne.
 *
 * Retourne `true` si une case a ete masquee, ce qui oblige a repasser sur l autre
 * dimension : masquer dans une ligne peut isoler une colonne, et reciproquement.
 */
function protectLine(line: Line, suppressedTotals: Set<string>): boolean {
	const suppressed = line.cells.filter((cell) => cell.suppressed).length;
	if (suppressed !== 1) return false;

	const secondary = pickSecondary(line);

	// Une ligne d une seule case ne peut pas en masquer deux : c est alors son
	// total qu on retire, sans quoi la case masquee se lit directement dedans.
	if (!secondary) {
		suppressedTotals.add(line.totalKey);
		return false;
	}

	secondary.suppressed = true;
	return true;
}

function sumLine(line: Line): number {
	return line.cells.reduce((acc, cell) => acc + cell.count, 0);
}

function totalsOf(lines: Line[], suppressedTotals: Set<string>): Map<string, number | null> {
	const totals = new Map<string, number | null>();

	for (const line of lines) {
		totals.set(line.key, suppressedTotals.has(line.totalKey) ? null : sumLine(line));
	}

	return totals;
}

/**
 * Masque les effectifs qui permettraient d identifier une personne.
 *
 * `counts` n a pas besoin d etre complet : les cases absentes valent zero et sont
 * ajoutees, parce qu une case manquante et une case a zero se lisent de la meme
 * facon dans un tableau et doivent donc etre protegees pareil.
 */
export function protectTable(
	counts: readonly CountedCell[],
	xKeys: readonly string[],
	yKeys: readonly string[],
	threshold: number = DEFAULT_K_THRESHOLD
): ProtectedTable {
	const observed = new Map(counts.map((cell) => [keyOf(cell.xKey, cell.yKey), cell.count]));

	const cells: WorkingCell[] = [];
	for (const xKey of xKeys) {
		for (const yKey of yKeys) {
			const count = observed.get(keyOf(xKey, yKey)) ?? 0;
			// Une case vide ne revele personne : elle reste publiee, et sert meme a
			// montrer qu une modalite n a recueilli aucune reponse.
			cells.push({ xKey, yKey, count, suppressed: count > 0 && count < threshold });
		}
	}

	const rows = groupBy(cells, 'row', (cell) => cell.xKey);
	const columns = groupBy(cells, 'column', (cell) => cell.yKey);
	const suppressedTotals = new Set<string>();

	// Le nombre de cases est fini et chaque tour n en masque que de nouvelles :
	// la boucle converge. La borne est une ceinture, pas une condition d arret
	// attendue.
	for (let pass = 0; pass < cells.length + 1; pass += 1) {
		const changed = [...rows, ...columns]
			.map((line) => protectLine(line, suppressedTotals))
			.some(Boolean);
		if (!changed) break;
	}

	return {
		cells: cells.map(({ xKey, yKey, count, suppressed }) => ({
			xKey,
			yKey,
			count: suppressed ? null : count,
			suppressed
		})),
		rowTotals: totalsOf(rows, suppressedTotals),
		columnTotals: totalsOf(columns, suppressedTotals),
		total: cells.reduce((acc, cell) => acc + cell.count, 0),
		threshold,
		suppressedCount: cells.filter((cell) => cell.suppressed).length
	};
}

/**
 * Cas particulier apparent de `protectTable` : une distribution simple.
 *
 * C est une table a une seule colonne, donc la protection par colonne suffit a
 * couvrir la soustraction depuis le total general. Aucun code dedie.
 */
export const SINGLE_COLUMN_KEY = '__all__';

export function protectDistribution(
	counts: ReadonlyMap<string, number>,
	keys: readonly string[],
	threshold: number = DEFAULT_K_THRESHOLD
): ProtectedTable {
	const cells = keys.map((key) => ({
		xKey: key,
		yKey: SINGLE_COLUMN_KEY,
		count: counts.get(key) ?? 0
	}));

	return protectTable(cells, keys, [SINGLE_COLUMN_KEY], threshold);
}
