import { describe, expect, it } from 'vitest';
import { parseAvailability, parseEvent, parseTask, parseTaskStatus } from './input';
import { isTime, parisInstant } from './calendar';

function form(fields: Record<string, string>): FormData {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) data.set(key, value);
	return data;
}

describe('parisInstant', () => {
	it('suit l heure d ete et l heure d hiver', () => {
		expect(parisInstant('2026-10-05', '14:30').toISOString()).toBe('2026-10-05T12:30:00.000Z');
		expect(parisInstant('2026-01-15', '09:00').toISOString()).toBe('2026-01-15T08:00:00.000Z');
	});

	it('reconnait une heure', () => {
		expect(isTime('09:05')).toBe(true);
		expect(isTime('24:00')).toBe(false);
		expect(isTime('9h')).toBe(false);
	});
});

describe('parseEvent', () => {
	const base = { title: 'Réunion de rentrée', kind: 'MEETING', startDay: '2026-10-05' };

	it('pose une journee entiere a midi, heure de Paris', () => {
		const result = parseEvent(form(base));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.allDay).toBe(true);
		expect(result.value.startsAt.toISOString()).toBe('2026-10-05T10:00:00.000Z');
		expect(result.value.endsAt).toBeNull();
		expect(result.value.channel).toBeNull();
	});

	it('garde l heure, la fin et le canal d une publication', () => {
		const result = parseEvent(
			form({
				...base,
				kind: 'EDITORIAL',
				channel: 'Instagram',
				startTime: '18:00',
				endDay: '2026-10-07',
				note: '  carrousel  '
			})
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.allDay).toBe(false);
		expect(result.value.channel).toBe('Instagram');
		expect(result.value.note).toBe('carrousel');
		expect(result.value.endsAt?.toISOString()).toBe('2026-10-07T10:00:00.000Z');
	});

	it('ignore une fin le jour meme, et le canal d un evenement non editorial', () => {
		const result = parseEvent(form({ ...base, endDay: '2026-10-05', channel: 'Instagram' }));

		expect(result.ok && result.value.endsAt).toBeNull();
		expect(result.ok && result.value.channel).toBeNull();
	});

	it.each([
		[{ ...base, title: '  ' }, 'Donnez un titre.'],
		[{ ...base, title: 'x'.repeat(201) }, 'Titre trop long : 200 caractères au maximum.'],
		[{ ...base, kind: 'PARTY' }, 'Nature d’événement inconnue.'],
		[{ ...base, startDay: '' }, 'Indiquez le jour de l’événement.'],
		[{ ...base, startTime: '9h' }, 'Heure illisible : écrivez-la sous la forme 14:30.'],
		[{ ...base, endDay: 'demain' }, 'Jour de fin illisible.'],
		[{ ...base, endDay: '2026-10-01' }, 'Le jour de fin précède le jour de début.']
	])('refuse une saisie invalide', (fields, reason) => {
		expect(parseEvent(form(fields))).toEqual({ ok: false, reason });
	});
});

describe('parseTask', () => {
	it('lit une tache complete', () => {
		const result = parseTask(
			form({ title: 'Monter le reportage', dueOn: '2026-10-09', assigneeId: 'u1', note: '' })
		);

		expect(result).toEqual({
			ok: true,
			value: {
				title: 'Monter le reportage',
				note: null,
				dueOn: new Date('2026-10-09T00:00:00Z'),
				assigneeId: 'u1'
			}
		});
	});

	it('accepte une tache sans echeance ni responsable', () => {
		const result = parseTask(form({ title: 'Relire la méthodologie' }));
		expect(result.ok && result.value.dueOn).toBeNull();
		expect(result.ok && result.value.assigneeId).toBeNull();
	});

	it('refuse un titre vide ou une echeance illisible', () => {
		expect(parseTask(form({ title: '' })).ok).toBe(false);
		expect(parseTask(form({ title: 'x', dueOn: '2026-02-30' }))).toEqual({
			ok: false,
			reason: 'Échéance illisible.'
		});
	});

	it('ne connait que les etats du registre', () => {
		expect(parseTaskStatus(form({ status: 'DONE' }))).toEqual({ ok: true, value: 'DONE' });
		expect(parseTaskStatus(form({ status: 'LATE' })).ok).toBe(false);
	});
});

describe('parseAvailability', () => {
	it('tient en un jour sans jour de fin', () => {
		const result = parseAvailability(form({ kind: 'ABSENT', startsOn: '2026-10-05' }));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.endsOn).toEqual(result.value.startsOn);
		expect(result.value.userId).toBeNull();
	});

	it('lit une periode pour un autre membre', () => {
		const result = parseAvailability(
			form({ kind: 'PRESENT', startsOn: '2026-10-05', endsOn: '2026-10-09', userId: 'u2' })
		);

		expect(result.ok && result.value.userId).toBe('u2');
		expect(result.ok && result.value.endsOn.toISOString()).toBe('2026-10-09T00:00:00.000Z');
	});

	it.each([
		[{ kind: 'MALADE', startsOn: '2026-10-05' }, 'Choisissez « présent » ou « absent ».'],
		[{ kind: 'ABSENT', startsOn: '' }, 'Indiquez le premier jour.'],
		[{ kind: 'ABSENT', startsOn: '2026-10-05', endsOn: 'lundi' }, 'Dernier jour illisible.'],
		[
			{ kind: 'ABSENT', startsOn: '2026-10-05', endsOn: '2026-10-01' },
			'Le dernier jour précède le premier.'
		]
	])('refuse une saisie invalide', (fields, reason) => {
		expect(parseAvailability(form(fields))).toEqual({ ok: false, reason });
	});
});
