import { dayToDate, isTime, parisInstant } from './calendar';
import {
	isAvailabilityKind,
	isEventKind,
	isTaskStatus,
	type AvailabilityKindKey,
	type EventKind,
	type TaskStatus
} from './entries';

/**
 * Lecture des formulaires du planning.
 *
 * Isolee de la route pour se tester sans base ni requete : c'est ici que se
 * decide qu'une fin avant le debut est refusee, et une regle de ce genre
 * qu'aucun test ne tient finit par sauter.
 */

export type Parsed<T> =
	{ readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

const TITLE_MAX = 200;
const NOTE_MAX = 2000;

function text(form: FormData, name: string): string {
	return String(form.get(name) ?? '').trim();
}

function optional(form: FormData, name: string): string | null {
	const value = text(form, name);
	return value === '' ? null : value.slice(0, NOTE_MAX);
}

function title(form: FormData): Parsed<string> {
	const value = text(form, 'title');
	if (value === '') return { ok: false, reason: 'Donnez un titre.' };
	if (value.length > TITLE_MAX)
		return { ok: false, reason: `Titre trop long : ${TITLE_MAX} caractères au maximum.` };
	return { ok: true, value };
}

export interface EventInput {
	readonly title: string;
	readonly kind: EventKind;
	readonly channel: string | null;
	readonly note: string | null;
	readonly startsAt: Date;
	readonly endsAt: Date | null;
	readonly allDay: boolean;
}

/** Le jour de fin d'un evenement, `null` quand il tient en un jour. */
function eventEnd(endDay: string, startDay: string): Parsed<string | null> {
	if (endDay === '' || endDay === startDay) return { ok: true, value: null };
	if (dayToDate(endDay) === null) return { ok: false, reason: 'Jour de fin illisible.' };
	if (endDay < startDay) return { ok: false, reason: 'Le jour de fin précède le jour de début.' };
	return { ok: true, value: endDay };
}

/**
 * Un evenement : un jour, une heure facultative, un jour de fin facultatif.
 *
 * Une journee entiere est posee a midi, heure de Paris, et non a minuit : a
 * minuit, le moindre ecart de fuseau la ferait glisser sur la veille.
 */
export function parseEvent(form: FormData): Parsed<EventInput> {
	const name = title(form);
	if (!name.ok) return name;

	const kind = text(form, 'kind');
	if (!isEventKind(kind)) return { ok: false, reason: 'Nature d’événement inconnue.' };

	const startDay = text(form, 'startDay');
	if (dayToDate(startDay) === null)
		return { ok: false, reason: 'Indiquez le jour de l’événement.' };

	const time = text(form, 'startTime');
	if (time !== '' && !isTime(time))
		return { ok: false, reason: 'Heure illisible : écrivez-la sous la forme 14:30.' };

	const endDay = eventEnd(text(form, 'endDay'), startDay);
	if (!endDay.ok) return endDay;

	return {
		ok: true,
		value: {
			title: name.value,
			kind,
			channel: kind === 'EDITORIAL' ? optional(form, 'channel') : null,
			note: optional(form, 'note'),
			startsAt: parisInstant(startDay, time === '' ? '12:00' : time),
			endsAt: endDay.value === null ? null : parisInstant(endDay.value, '12:00'),
			allDay: time === ''
		}
	};
}

export interface TaskInput {
	readonly title: string;
	readonly note: string | null;
	readonly dueOn: Date | null;
	readonly assigneeId: string | null;
}

export function parseTask(form: FormData): Parsed<TaskInput> {
	const name = title(form);
	if (!name.ok) return name;

	const due = text(form, 'dueOn');
	const dueOn = due === '' ? null : dayToDate(due);
	if (due !== '' && dueOn === null) return { ok: false, reason: 'Échéance illisible.' };

	return {
		ok: true,
		value: {
			title: name.value,
			note: optional(form, 'note'),
			dueOn,
			assigneeId: optional(form, 'assigneeId')
		}
	};
}

export function parseTaskStatus(form: FormData): Parsed<TaskStatus> {
	const status = text(form, 'status');
	return isTaskStatus(status)
		? { ok: true, value: status }
		: { ok: false, reason: 'État de tâche inconnu.' };
}

export interface AvailabilityInput {
	readonly userId: string | null;
	readonly kind: AvailabilityKindKey;
	readonly startsOn: Date;
	readonly endsOn: Date;
	readonly note: string | null;
}

/** Une periode de presence ou d'absence. Sans jour de fin, elle tient en un jour. */
export function parseAvailability(form: FormData): Parsed<AvailabilityInput> {
	const kind = text(form, 'kind');
	if (!isAvailabilityKind(kind))
		return { ok: false, reason: 'Choisissez « présent » ou « absent ».' };

	const startsOn = dayToDate(text(form, 'startsOn'));
	if (startsOn === null) return { ok: false, reason: 'Indiquez le premier jour.' };

	const end = text(form, 'endsOn');
	const endsOn = end === '' ? startsOn : dayToDate(end);
	if (endsOn === null) return { ok: false, reason: 'Dernier jour illisible.' };
	if (endsOn < startsOn) return { ok: false, reason: 'Le dernier jour précède le premier.' };

	return {
		ok: true,
		value: {
			userId: optional(form, 'userId'),
			kind,
			startsOn,
			endsOn,
			note: optional(form, 'note')
		}
	};
}
