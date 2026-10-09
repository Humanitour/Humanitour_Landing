/**
 * Mise en forme des chiffres publies.
 *
 * Une seule implementation, utilisee partout. Deux formatages concurrents de la
 * meme part produiraient « 62 % » ici et « 61,5 % » la, sur la meme donnee.
 */

const COUNT_FORMAT = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

const SHARE_FORMAT = new Intl.NumberFormat('fr-FR', {
	style: 'percent',
	minimumFractionDigits: 1,
	maximumFractionDigits: 1
});

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
	day: 'numeric',
	month: 'long',
	year: 'numeric'
});

/*
 * Le lundi d une semaine, sans l annee.
 *
 * En UTC : le lundi est calcule a minuit UTC (`survey/timeline.ts`). Formate en
 * heure locale, il deviendrait le dimanche soir sur un serveur a l ouest de
 * Greenwich, et l axe d une meme courbe changerait selon l hebergeur.
 */
const WEEK_FORMAT = new Intl.DateTimeFormat('fr-FR', {
	day: 'numeric',
	month: 'short',
	timeZone: 'UTC'
});

const DECIMAL_FORMATS = new Map<number, Intl.NumberFormat>();

/**
 * Nombre decimal a la francaise : « 3,5 », « 0,0001 ».
 *
 * Pour les grandeurs qui ne sont ni des effectifs ni des parts : poids, effet
 * de plan, seuils. Les zeros inutiles sont retires, jamais la precision.
 */
export function formatDecimal(value: number | null, maximumFractionDigits = 2): string {
	if (value === null || !Number.isFinite(value)) return SUPPRESSED_SYMBOL;

	let format = DECIMAL_FORMATS.get(maximumFractionDigits);
	if (!format) {
		format = new Intl.NumberFormat('fr-FR', { maximumFractionDigits });
		DECIMAL_FORMATS.set(maximumFractionDigits, format);
	}
	return format.format(value);
}

/** Ecart entre deux parts, en points signes : « +2,4 pt », « −0,8 pt ». */
export function formatPoints(delta: number | null): string {
	if (delta === null || !Number.isFinite(delta)) return SUPPRESSED_SYMBOL;

	const points = delta * 100;
	if (Math.abs(points) < 0.05) return '0,0 pt';
	const sign = points > 0 ? '+' : '−';
	return `${sign}${ONE_DECIMAL.format(Math.abs(points))} pt`;
}

/** Le signe ne se separe jamais du nombre en fin de ligne. */
const NO_BREAK_SPACE = String.fromCharCode(0xa0);

/** Marge d erreur d une part, en points : « ± 3,2 pt ». */
export function formatMargin(margin: number | null): string {
	if (margin === null || !Number.isFinite(margin)) return SUPPRESSED_SYMBOL;
	return `±${NO_BREAK_SPACE}${ONE_DECIMAL.format(Math.abs(margin) * 100)} pt`;
}

const ONE_DECIMAL = new Intl.NumberFormat('fr-FR', {
	minimumFractionDigits: 1,
	maximumFractionDigits: 1
});

/** Texte affiche a la place d un chiffre masque par le seuil d anonymat. */
export const SUPPRESSED_LABEL = 'Effectif insuffisant';

/** Symbole compact, pour les cases de tableau ou le texte complet ne tient pas. */
export const SUPPRESSED_SYMBOL = '—';

export function formatCount(value: number | null): string {
	if (value === null) return SUPPRESSED_SYMBOL;
	return COUNT_FORMAT.format(value);
}

/**
 * Part en pourcentage.
 *
 * Une decimale : au-dela on suggere une precision que l echantillon n a pas ;
 * en-deca on ecrase des ecarts reels sur les petites modalites.
 */
export function formatShare(ratio: number | null): string {
	if (ratio === null) return SUPPRESSED_SYMBOL;
	return SHARE_FORMAT.format(ratio);
}

/**
 * Effectif annonce avec son libelle.
 *
 * Tout pourcentage publie doit voyager avec sa base : « 62,0 % » ne veut rien
 * dire sans savoir si c est sur 12 ou sur 1 200 personnes.
 */
export function formatBase(respondents: number): string {
	if (respondents === 0) return 'aucun répondant';
	if (respondents === 1) return 'base : 1 répondant';
	return `base : ${COUNT_FORMAT.format(respondents)} répondants`;
}

export function formatDate(value: Date | string | null): string {
	if (!value) return '';
	const date = typeof value === 'string' ? new Date(value) : value;
	if (Number.isNaN(date.getTime())) return '';
	return DATE_FORMAT.format(date);
}

/** Periode de terrain, telle qu affichee sous chaque resultat. */
export function formatFieldwork(start: Date | string | null, end: Date | string | null): string {
	const from = formatDate(start);
	const to = formatDate(end);

	if (from && to) return `Terrain du ${from} au ${to}`;
	if (from) return `Terrain depuis le ${from}`;
	if (to) return `Terrain jusqu'au ${to}`;
	return '';
}

/** Libelle court d une semaine, par son lundi : « 17 août ». */
export function formatWeek(start: Date): string {
	return WEEK_FORMAT.format(start);
}
