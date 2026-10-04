import { describe, expect, it } from 'vitest';
import {
	LAYER_KEYS,
	availabilityEntry,
	campaignEntry,
	entriesByDay,
	eventEntry,
	isAvailabilityKind,
	isEventKind,
	isLayer,
	isOverdue,
	isTaskStatus,
	mediaEntry,
	onLayers,
	parseLayers,
	planningQuery,
	toggleLayer,
	surveyEntries,
	taskEntry,
	type PlanningEntry
} from './entries';

const TODAY = '2026-10-05';

describe('eventEntry', () => {
	const base = {
		id: 'e1',
		title: 'Reunion de rentree',
		kind: 'MEETING' as const,
		note: null,
		channel: null,
		startsAt: new Date('2026-10-05T12:30:00Z'),
		endsAt: null,
		allDay: false
	};

	it('range une reunion dans les rendez-vous, a l heure de Paris', () => {
		const entry = eventEntry(base);

		expect(entry.layer).toBe('meeting');
		expect(entry.start).toBe('2026-10-05');
		expect(entry.end).toBe('2026-10-05');
		expect(entry.time).toBe('14:30');
		expect(entry.badge).toBe('Réunion');
		expect(entry.href).toBeNull();
	});

	it('range une publication prevue dans l editorial, sous le nom de son canal', () => {
		const entry = eventEntry({ ...base, kind: 'EDITORIAL', channel: 'Instagram', allDay: true });

		expect(entry.layer).toBe('editorial');
		expect(entry.badge).toBe('Instagram');
		expect(entry.time).toBeNull();
	});

	it('nomme la nature d une publication sans canal', () => {
		expect(eventEntry({ ...base, kind: 'EDITORIAL' }).badge).toBe('Publication prévue');
	});

	it('couvre plusieurs jours, et ne perd pas un evenement dont la fin precede le debut', () => {
		expect(eventEntry({ ...base, endsAt: new Date('2026-10-07T10:00:00Z') }).end).toBe(
			'2026-10-07'
		);
		expect(eventEntry({ ...base, endsAt: new Date('2026-10-01T10:00:00Z') }).end).toBe(
			'2026-10-05'
		);
	});
});

describe('taches', () => {
	const task = {
		id: 't1',
		title: 'Monter le reportage',
		note: null,
		status: 'TODO' as const,
		dueOn: new Date('2026-10-03T00:00:00Z'),
		assigneeId: 'u1',
		assigneeName: 'Côme'
	};

	it('signale le retard, pas le jour meme ni une tache faite', () => {
		expect(isOverdue(task, TODAY)).toBe(true);
		expect(isOverdue({ ...task, dueOn: new Date('2026-10-05T00:00:00Z') }, TODAY)).toBe(false);
		expect(isOverdue({ ...task, status: 'DONE' }, TODAY)).toBe(false);
		expect(isOverdue({ ...task, dueOn: null }, TODAY)).toBe(false);
	});

	it('pose la tache a son echeance, avec son responsable', () => {
		const entry = taskEntry(task, TODAY);

		expect(entry?.start).toBe('2026-10-03');
		expect(entry?.title).toBe('Monter le reportage (Côme)');
		expect(entry?.badge).toBe('En retard');
		expect(entry?.alert).toBe(true);
		expect(entry?.ownerId).toBe('u1');
	});

	it('donne l etat d une tache a l heure', () => {
		const entry = taskEntry(
			{ ...task, status: 'DOING', assigneeName: null, dueOn: new Date('2026-10-09T00:00:00Z') },
			TODAY
		);

		expect(entry?.title).toBe('Monter le reportage');
		expect(entry?.badge).toBe('En cours');
		expect(entry?.alert).toBe(false);
	});

	it('laisse hors du calendrier une tache sans echeance', () => {
		expect(taskEntry({ ...task, dueOn: null }, TODAY)).toBeNull();
	});
});

describe('availabilityEntry', () => {
	const row = {
		id: 'a1',
		userId: 'u1',
		userName: 'Mareva',
		kind: 'ABSENT' as const,
		startsOn: new Date('2026-10-05T00:00:00Z'),
		endsOn: new Date('2026-10-09T00:00:00Z'),
		note: 'Conges'
	};

	it('couvre la periode, bornes incluses, et signale l absence', () => {
		const entry = availabilityEntry(row);

		expect(entry.layer).toBe('presence');
		expect([entry.start, entry.end]).toEqual(['2026-10-05', '2026-10-09']);
		expect(entry.badge).toBe('Absent');
		expect(entry.alert).toBe(true);
		expect(entry.ownerId).toBe('u1');
	});

	it('ne met pas en avant une presence, et redresse une periode a l envers', () => {
		const entry = availabilityEntry({
			...row,
			kind: 'PRESENT',
			endsOn: new Date('2026-10-01T00:00:00Z')
		});

		expect(entry.alert).toBe(false);
		expect(entry.end).toBe('2026-10-05');
	});
});

describe('ce que les autres domaines datent', () => {
	it('pose un media a sa date de publication, avec l heure s il est programme', () => {
		const scheduled = mediaEntry({
			id: 'm1',
			title: 'Carnet de route',
			status: 'SCHEDULED',
			publishedAt: new Date('2026-10-06T07:00:00Z')
		});

		expect(scheduled?.href).toBe('/admin/medias/m1');
		expect(scheduled?.badge).toBe('Programmé');
		expect(scheduled?.time).toBe('09:00');

		const published = mediaEntry({
			id: 'm2',
			title: 'Archive',
			status: 'PUBLISHED',
			publishedAt: new Date('2026-10-06T07:00:00Z')
		});
		expect(published?.time).toBeNull();
	});

	it('laisse de cote un media sans date, et tolere un statut inconnu', () => {
		expect(mediaEntry({ id: 'm', title: 'x', status: 'DRAFT', publishedAt: null })).toBeNull();
		expect(
			mediaEntry({ id: 'm', title: 'x', status: 'AUTRE', publishedAt: new Date() })?.badge
		).toBeNull();
	});

	it('pose une campagne partie, jamais un brouillon', () => {
		const sent = campaignEntry({
			id: 'c1',
			subject: 'Lettre d octobre',
			sentAt: new Date('2026-10-02T08:00:00Z')
		});

		expect(sent?.layer).toBe('editorial');
		expect(sent?.href).toBe('/admin/infolettre/campagnes/c1');
		expect(campaignEntry({ id: 'c2', subject: 'x', sentAt: null })).toBeNull();
	});

	it('pose les jalons d une enquete, pas une bande continue', () => {
		const entries = surveyEntries({
			id: 's1',
			title: 'Presidentielle 2027',
			fieldworkStart: new Date('2026-07-01T08:00:00Z'),
			fieldworkEnd: new Date('2026-08-31T08:00:00Z'),
			opensAt: null,
			closesAt: null,
			publishedAt: new Date('2026-10-10T08:00:00Z')
		});

		expect(entries.map((entry) => entry.badge)).toEqual([
			'Début du terrain',
			'Fin du terrain',
			'Publication des résultats'
		]);
		expect(new Set(entries.map((entry) => entry.id)).size).toBe(3);
		for (const entry of entries) expect(entry.start).toBe(entry.end);
	});
});

describe('rangement', () => {
	function entry(partial: Partial<PlanningEntry> & Pick<PlanningEntry, 'id'>): PlanningEntry {
		return {
			source: 'event',
			sourceId: partial.id,
			layer: 'meeting',
			title: partial.id,
			badge: null,
			alert: false,
			note: null,
			start: TODAY,
			end: TODAY,
			time: null,
			href: null,
			ownerId: null,
			...partial
		};
	}

	it('repartit les entrees sur chaque jour couvert', () => {
		const byDay = entriesByDay(
			[entry({ id: 'a', end: '2026-10-06' })],
			[TODAY, '2026-10-06', '2026-10-07']
		);

		expect(byDay[TODAY]).toHaveLength(1);
		expect(byDay['2026-10-06']).toHaveLength(1);
		expect(byDay['2026-10-07']).toEqual([]);
	});

	it('met les journees entieres avant les heures, et les presences en dernier', () => {
		const byDay = entriesByDay(
			[
				entry({ id: 'presence', layer: 'presence' }),
				entry({ id: 'tard', time: '16:00' }),
				entry({ id: 'tot', time: '09:00' }),
				entry({ id: 'tache', layer: 'task' }),
				entry({ id: 'edito', layer: 'editorial' }),
				entry({ id: 'b-reunion' }),
				entry({ id: 'a-reunion' })
			],
			[TODAY]
		);

		expect(byDay[TODAY]?.map((item) => item.id)).toEqual([
			'edito',
			'a-reunion',
			'b-reunion',
			'tache',
			'tot',
			'tard',
			'presence'
		]);
	});

	it('filtre par calque', () => {
		const entries = [entry({ id: 'a' }), entry({ id: 'b', layer: 'media' })];
		expect(onLayers(entries, ['media']).map((item) => item.id)).toEqual(['b']);
	});
});

describe('parseLayers', () => {
	it('rend tous les calques sans parametre, ou avec un parametre illisible', () => {
		expect(parseLayers(null)).toEqual(LAYER_KEYS);
		expect(parseLayers('rien,du,tout')).toEqual(LAYER_KEYS);
	});

	it('garde l ordre du registre, pas celui de l adresse', () => {
		expect(parseLayers('task,survey')).toEqual(['survey', 'task']);
	});
});

describe('gardes de saisie', () => {
	it('reconnait les valeurs du registre et seulement elles', () => {
		expect(isLayer('media')).toBe(true);
		expect(isLayer('toString')).toBe(false);
		expect(isEventKind('FIELD')).toBe(true);
		expect(isEventKind('PARTY')).toBe(false);
		expect(isTaskStatus('DOING')).toBe(true);
		expect(isTaskStatus('LATE')).toBe(false);
		expect(isAvailabilityKind('ABSENT')).toBe(true);
		expect(isAvailabilityKind('MALADE')).toBe(false);
	});
});

describe('adresse du planning', () => {
	it('n ecrit pas les calques quand tous ou aucun sont demandes', () => {
		expect(planningQuery('2026-10', LAYER_KEYS)).toBe('?mois=2026-10');
		expect(planningQuery('2026-10', [])).toBe('?mois=2026-10');
	});

	it('ecrit les calques dans l ordre du registre', () => {
		expect(planningQuery('2026-10', ['task', 'survey'])).toBe(
			'?mois=2026-10&calques=survey%2Ctask'
		);
	});

	it('allume et eteint un calque', () => {
		expect(toggleLayer(['survey', 'task'], 'task')).toEqual(['survey']);
		expect(toggleLayer(['survey'], 'media')).toEqual(['survey', 'media']);
	});
});
