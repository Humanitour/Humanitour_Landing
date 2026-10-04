import { describe, expect, it } from 'vitest';
import {
	addDays,
	dayNumber,
	dayToDate,
	daysBetween,
	firstDay,
	formatDay,
	formatDayShort,
	formatMonth,
	inMonth,
	isDay,
	lastDay,
	monthGrid,
	monthParam,
	parisDay,
	parisTime,
	parseMonth,
	shiftMonth,
	storedDay,
	weekStart
} from './calendar';

describe('jours a Paris', () => {
	it('lit le jour a l heure de Paris, pas a celle du serveur', () => {
		// 23 h 30 UTC le 4 octobre : il est deja 1 h 30 le 5 a Paris.
		expect(parisDay(new Date('2026-10-04T23:30:00Z'))).toBe('2026-10-05');
	});

	it('donne l heure de Paris', () => {
		expect(parisTime(new Date('2026-10-05T12:30:00Z'))).toBe('14:30');
	});

	it('lit une colonne de date telle quelle, en UTC', () => {
		expect(storedDay(new Date('2026-10-05T00:00:00Z'))).toBe('2026-10-05');
	});
});

describe('isDay et dayToDate', () => {
	it('accepte un jour qui existe', () => {
		expect(isDay('2026-02-28')).toBe(true);
		expect(dayToDate('2026-02-28')?.toISOString()).toBe('2026-02-28T00:00:00.000Z');
	});

	it('refuse un jour qui n existe pas ou une saisie libre', () => {
		expect(isDay('2026-02-30')).toBe(false);
		expect(isDay('5 octobre')).toBe(false);
		expect(dayToDate('2026-13-01')).toBeNull();
	});
});

describe('arithmetique des jours', () => {
	it('passe les mois et les annees', () => {
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});

	it('trouve le lundi, y compris depuis un dimanche', () => {
		expect(weekStart('2026-10-04')).toBe('2026-09-28'); // dimanche
		expect(weekStart('2026-10-05')).toBe('2026-10-05'); // lundi
	});

	it('enumere une periode, bornes incluses', () => {
		expect(daysBetween('2026-10-30', '2026-11-01')).toEqual([
			'2026-10-30',
			'2026-10-31',
			'2026-11-01'
		]);
		expect(daysBetween('2026-10-02', '2026-10-01')).toEqual([]);
	});
});

describe('mois', () => {
	it('lit le mois de l adresse', () => {
		expect(parseMonth('2026-11', '2026-10-04')).toEqual({ year: 2026, month: 11 });
	});

	it('retombe sur le mois du jour quand l adresse est absente ou abimee', () => {
		expect(parseMonth(null, '2026-10-04')).toEqual({ year: 2026, month: 10 });
		expect(parseMonth('2026-13', '2026-10-04')).toEqual({ year: 2026, month: 10 });
		expect(parseMonth('octobre', '2026-10-04')).toEqual({ year: 2026, month: 10 });
	});

	it('avance et recule d une annee a l autre', () => {
		expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
		expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
		expect(monthParam({ year: 2026, month: 3 })).toBe('2026-03');
	});

	it('connait son premier et son dernier jour', () => {
		expect(firstDay({ year: 2028, month: 2 })).toBe('2028-02-01');
		expect(lastDay({ year: 2028, month: 2 })).toBe('2028-02-29');
	});

	it('pose des semaines completes, du lundi au dimanche', () => {
		const grid = monthGrid({ year: 2026, month: 10 });

		expect(grid[0]?.[0]).toBe('2026-09-28');
		expect(grid.at(-1)?.at(-1)).toBe('2026-11-01');
		for (const week of grid) expect(week).toHaveLength(7);
	});

	it('distingue les jours du mois de ceux qui completent la grille', () => {
		expect(inMonth('2026-10-31', { year: 2026, month: 10 })).toBe(true);
		expect(inMonth('2026-09-28', { year: 2026, month: 10 })).toBe(false);
	});
});

describe('libelles', () => {
	it('ecrit le mois et le jour en francais', () => {
		expect(formatMonth({ year: 2026, month: 10 })).toBe('octobre 2026');
		expect(formatDay('2026-10-05')).toBe('lundi 5 octobre');
		expect(formatDayShort('2026-10-05')).toBe('lun. 5 oct.');
		expect(dayNumber('2026-10-05')).toBe('5');
	});
});
