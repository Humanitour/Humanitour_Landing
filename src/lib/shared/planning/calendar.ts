/**
 * Le calendrier du planning : jours, semaines, mois.
 *
 * Tout jour est une chaine `AAAA-MM-JJ`, jamais un `Date`. Un `Date` est un
 * instant, et le meme instant tombe un jour different a Paris et a UTC : une
 * reunion posee a 0 h 30 le 5 s'afficherait le 4 sur un serveur regle a UTC.
 * Une chaine de jour ne porte aucun fuseau, elle se compare et se trie telle
 * quelle, et deux ecrans ne peuvent pas en faire deux lectures.
 */

/** Le fuseau de l'association. Le planning se lit a l'heure de Paris, ou que tourne le serveur. */
export const PLANNING_TIME_ZONE = 'Europe/Paris';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

const PARIS_DAY = new Intl.DateTimeFormat('en-CA', {
	timeZone: PLANNING_TIME_ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});

const PARIS_TIME = new Intl.DateTimeFormat('fr-FR', {
	timeZone: PLANNING_TIME_ZONE,
	hour: '2-digit',
	minute: '2-digit'
});

const MONTH_TITLE = new Intl.DateTimeFormat('fr-FR', {
	month: 'long',
	year: 'numeric',
	timeZone: 'UTC'
});

const DAY_TITLE = new Intl.DateTimeFormat('fr-FR', {
	weekday: 'long',
	day: 'numeric',
	month: 'long',
	timeZone: 'UTC'
});

const DAY_SHORT = new Intl.DateTimeFormat('fr-FR', {
	weekday: 'short',
	day: 'numeric',
	month: 'short',
	timeZone: 'UTC'
});

/** Les jours de la semaine, lundi en tete comme le calendrier francais. */
export const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export interface Month {
	readonly year: number;
	/** De 1 a 12. */
	readonly month: number;
}

/** Le jour d'un instant, a Paris. */
export function parisDay(instant: Date): string {
	return PARIS_DAY.format(instant);
}

/** L'heure d'un instant, a Paris : « 14:30 ». */
export function parisTime(instant: Date): string {
	return PARIS_TIME.format(instant);
}

/**
 * Le jour d'une colonne `@db.Date`.
 *
 * PostgreSQL la rend a minuit UTC : la lire a l'heure de Paris serait juste,
 * mais la lire a l'heure de Los Angeles donnerait la veille. Le jour est donc
 * pris tel quel, en UTC.
 */
export function storedDay(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export function isDay(value: string): boolean {
	if (!DAY_PATTERN.test(value)) return false;
	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && storedDay(date) === value;
}

/** Un jour saisi vers une colonne `@db.Date`. `null` si la saisie n'est pas un jour. */
export function dayToDate(day: string): Date | null {
	return isDay(day) ? new Date(`${day}T00:00:00Z`) : null;
}

/** Decale un jour de `count` jours, en avant ou en arriere. */
export function addDays(day: string, count: number): string {
	const date = new Date(`${day}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + count);
	return storedDay(date);
}

/** Le lundi de la semaine d'un jour. */
export function weekStart(day: string): string {
	const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
	// getUTCDay : 0 pour dimanche. Le lundi est a 6 jours d'un dimanche.
	return addDays(day, -((weekday + 6) % 7));
}

/** Tous les jours de `from` a `to`, bornes incluses. Vide si l'ordre est inverse. */
export function daysBetween(from: string, to: string): string[] {
	const days: string[] = [];
	for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
	return days;
}

/** Le mois demande dans l'adresse (`?mois=2026-10`), ou celui du jour donne. */
export function parseMonth(param: string | null, today: string): Month {
	const match = param === null ? null : MONTH_PATTERN.exec(param);
	const month = match ? Number(match[2]) : 0;

	if (match && month >= 1 && month <= 12) return { year: Number(match[1]), month };

	return { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
}

export function monthParam({ year, month }: Month): string {
	return `${year}-${String(month).padStart(2, '0')}`;
}

export function shiftMonth({ year, month }: Month, delta: number): Month {
	const index = year * 12 + (month - 1) + delta;
	return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function firstDay(month: Month): string {
	return `${monthParam(month)}-01`;
}

export function lastDay(month: Month): string {
	return addDays(firstDay(shiftMonth(month, 1)), -1);
}

/**
 * La grille d'un mois : des semaines completes, du lundi au dimanche.
 *
 * Les jours du mois precedent et du suivant qui completent la premiere et la
 * derniere semaine sont inclus : une semaine coupee en deux cacherait la
 * reunion du lundi 30 a qui regarde le mois suivant.
 */
export function monthGrid(month: Month): string[][] {
	const from = weekStart(firstDay(month));
	const to = addDays(weekStart(lastDay(month)), 6);
	const days = daysBetween(from, to);

	const weeks: string[][] = [];
	for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));
	return weeks;
}

export function inMonth(day: string, month: Month): boolean {
	return day.startsWith(`${monthParam(month)}-`);
}

/** « octobre 2026 ». */
export function formatMonth(month: Month): string {
	return MONTH_TITLE.format(new Date(`${firstDay(month)}T00:00:00Z`));
}

/** « lundi 5 octobre ». */
export function formatDay(day: string): string {
	return DAY_TITLE.format(new Date(`${day}T00:00:00Z`));
}

/** « lun. 5 oct. ». */
export function formatDayShort(day: string): string {
	return DAY_SHORT.format(new Date(`${day}T00:00:00Z`));
}

/** Le numero du jour dans le mois, sans zero : « 5 ». */
export function dayNumber(day: string): string {
	return String(Number(day.slice(8, 10)));
}
