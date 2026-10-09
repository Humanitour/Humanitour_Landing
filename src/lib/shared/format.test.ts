import { describe, expect, it } from 'vitest';
import {
	formatBase,
	formatCount,
	formatDate,
	formatDecimal,
	formatFieldwork,
	formatMargin,
	formatPoints,
	formatShare,
	formatWeek,
	SUPPRESSED_SYMBOL
} from './format';

/**
 * Les espaces produits par Intl en francais sont des espaces insecables
 * etroites (U+202F) ou insecables (U+00A0), pas des espaces ordinaires.
 * On compare donc sur une version normalisee.
 */
function plain(value: string): string {
	return value.replace(/[\u202f\u00a0]/g, ' ');
}

describe('formatCount', () => {
	it('groupe les milliers', () => {
		expect(plain(formatCount(1234))).toBe('1 234');
	});

	it('laisse les petits nombres intacts', () => {
		expect(formatCount(7)).toBe('7');
		expect(formatCount(0)).toBe('0');
	});

	it('affiche le symbole de masquage pour une valeur masquee', () => {
		expect(formatCount(null)).toBe(SUPPRESSED_SYMBOL);
	});
});

describe('formatShare', () => {
	it('affiche une decimale', () => {
		// Une decimale de plus suggererait une precision que l echantillon n a pas.
		expect(plain(formatShare(0.6234))).toBe('62,3 %');
	});

	it('arrondit correctement', () => {
		expect(plain(formatShare(0.5))).toBe('50,0 %');
		expect(plain(formatShare(1))).toBe('100,0 %');
		expect(plain(formatShare(0))).toBe('0,0 %');
	});

	it('affiche le symbole de masquage pour une part masquee', () => {
		expect(formatShare(null)).toBe(SUPPRESSED_SYMBOL);
	});
});

describe('formatDecimal', () => {
	it('ecrit a la francaise, sans zero inutile', () => {
		expect(formatDecimal(3.5)).toBe('3,5');
		expect(formatDecimal(0.0001, 4)).toBe('0,0001');
		expect(formatDecimal(1.23456)).toBe('1,23');
	});

	it('rend le symbole des valeurs absentes', () => {
		expect(formatDecimal(null)).toBe(SUPPRESSED_SYMBOL);
		expect(formatDecimal(Number.NaN)).toBe(SUPPRESSED_SYMBOL);
	});
});

describe('formatMargin', () => {
	it('donne la marge en points, a une decimale', () => {
		expect(formatMargin(0.0318)).toBe('± 3,2 pt');
	});

	it('rend le tiret sans marge', () => {
		expect(formatMargin(null)).toBe(SUPPRESSED_SYMBOL);
		expect(formatMargin(Number.NaN)).toBe(SUPPRESSED_SYMBOL);
	});
});

describe('formatPoints', () => {
	it('signe l ecart en points, a une decimale', () => {
		expect(formatPoints(0.024)).toBe('+2,4 pt');
		expect(formatPoints(-0.008)).toBe('−0,8 pt');
	});

	it('ne signe pas un ecart qui s arrondit a zero', () => {
		expect(formatPoints(0.0004)).toBe('0,0 pt');
	});

	it('rend le symbole des valeurs absentes', () => {
		expect(formatPoints(null)).toBe(SUPPRESSED_SYMBOL);
	});
});

describe('formatBase', () => {
	it('annonce la base au pluriel', () => {
		expect(plain(formatBase(1200))).toBe('base : 1 200 répondants');
	});

	it('accorde au singulier', () => {
		expect(formatBase(1)).toBe('base : 1 répondant');
	});

	it('le dit quand il n y a personne', () => {
		expect(formatBase(0)).toBe('aucun répondant');
	});
});

describe('formatDate', () => {
	it('ecrit la date en toutes lettres', () => {
		expect(plain(formatDate(new Date('2026-07-04T12:00:00Z')))).toContain('juillet');
	});

	it('accepte une chaine ISO', () => {
		expect(formatDate('2026-07-04T12:00:00Z')).not.toBe('');
	});

	it('rend une chaine vide pour une date absente ou invalide', () => {
		expect(formatDate(null)).toBe('');
		expect(formatDate('pas une date')).toBe('');
	});
});

describe('formatFieldwork', () => {
	const start = new Date('2026-06-15T00:00:00Z');
	const end = new Date('2026-08-20T00:00:00Z');

	it('annonce une periode complete', () => {
		const text = formatFieldwork(start, end);
		expect(text).toMatch(/^Terrain du /);
		expect(text).toContain(' au ');
	});

	it('gere une periode encore ouverte', () => {
		expect(formatFieldwork(start, null)).toMatch(/^Terrain depuis le /);
	});

	it('gere une periode dont seule la fin est connue', () => {
		expect(formatFieldwork(null, end)).toMatch(/^Terrain jusqu'au /);
	});

	it('rend une chaine vide quand rien n est renseigne', () => {
		expect(formatFieldwork(null, null)).toBe('');
	});
});

describe('formatWeek', () => {
	it('designe une semaine par son lundi, sans annee', () => {
		expect(formatWeek(new Date('2026-08-17T00:00:00Z'))).toBe('17 août');
	});

	it('reste le lundi quel que soit le fuseau du serveur', () => {
		// Minuit UTC : en heure locale a l ouest de Greenwich, ce serait dimanche.
		expect(formatWeek(new Date('2026-08-31T00:00:00Z'))).toBe('31 août');
	});
});
