import { parisDay, parisTime, storedDay } from './calendar';

/**
 * Ce que le planning affiche : une seule forme pour six provenances.
 *
 * Chaque domaine garde ses dates chez lui (un media sa date de publication, une
 * enquete son terrain) et le planning les LIT. Les fonctions de ce fichier
 * traduisent une ligne de chaque domaine en entree de calendrier ; le
 * calendrier, lui, ne sait plus d'ou vient ce qu'il range. Ajouter une
 * provenance, c'est un calque et une fonction ici, pas une branche dans la
 * grille.
 */

export const PLANNING_LAYERS = {
	editorial: {
		label: 'Éditorial',
		description: 'Publications prévues et infolettres envoyées.'
	},
	meeting: {
		label: 'Rendez-vous',
		description: 'Réunions, sorties de terrain et autres rendez-vous de l’équipe.'
	},
	survey: {
		label: 'Sondages',
		description: 'Terrain, ouverture et clôture des questionnaires, publication des résultats.'
	},
	media: {
		label: 'Médias',
		description: 'Articles, vidéos et podcasts publiés ou programmés.'
	},
	task: {
		label: 'Tâches',
		description: 'Les tâches de l’équipe, à leur échéance.'
	},
	presence: {
		label: 'Présences',
		description: 'Qui est présent, qui est absent.'
	}
} as const;

export type PlanningLayer = keyof typeof PLANNING_LAYERS;

export const LAYER_KEYS = Object.keys(PLANNING_LAYERS) as PlanningLayer[];

export function isLayer(value: string): value is PlanningLayer {
	return Object.prototype.hasOwnProperty.call(PLANNING_LAYERS, value);
}

/** Ce qu'on peut faire d'une entree en cliquant dessus : la modifier ici, ou aller a sa fiche. */
export type EntrySource = 'event' | 'task' | 'availability' | 'media' | 'survey' | 'campaign';

export interface PlanningEntry {
	/** Unique dans le planning : la meme enquete donne plusieurs entrees. */
	readonly id: string;
	readonly source: EntrySource;
	/** L'identifiant de la ligne d'origine. */
	readonly sourceId: string;
	readonly layer: PlanningLayer;
	readonly title: string;
	/** Etat lisible en toutes lettres : « Absent », « Programmé », « En retard ». */
	readonly badge: string | null;
	/** Vrai quand l'etat demande l'attention : tache en retard, absence. */
	readonly alert: boolean;
	readonly note: string | null;
	/** Premier et dernier jour, bornes incluses. */
	readonly start: string;
	readonly end: string;
	/** Heure de debut a Paris, `null` pour une journee entiere. */
	readonly time: string | null;
	/** La fiche d'origine dans le back-office, `null` si l'entree se modifie dans le planning. */
	readonly href: string | null;
	/** Le membre concerne : responsable d'une tache, titulaire d'une presence. */
	readonly ownerId: string | null;
}

/* ------------------------------------------------------------------------ */
/* Evenements du planning                                                   */
/* ------------------------------------------------------------------------ */

export const EVENT_KINDS = {
	EDITORIAL: 'Publication prévue',
	MEETING: 'Réunion',
	FIELD: 'Terrain',
	OTHER: 'Autre'
} as const;

export type EventKind = keyof typeof EVENT_KINDS;

export function isEventKind(value: string): value is EventKind {
	return Object.prototype.hasOwnProperty.call(EVENT_KINDS, value);
}

export interface EventRow {
	readonly id: string;
	readonly title: string;
	readonly kind: EventKind;
	readonly note: string | null;
	readonly channel: string | null;
	readonly startsAt: Date;
	readonly endsAt: Date | null;
	readonly allDay: boolean;
}

export function eventEntry(row: EventRow): PlanningEntry {
	const start = parisDay(row.startsAt);
	const end = row.endsAt ? parisDay(row.endsAt) : start;
	const editorial = row.kind === 'EDITORIAL';

	return {
		id: `event:${row.id}`,
		source: 'event',
		sourceId: row.id,
		layer: editorial ? 'editorial' : 'meeting',
		title: row.title,
		badge: editorial && row.channel ? row.channel : EVENT_KINDS[row.kind],
		alert: false,
		note: row.note,
		start,
		// Une fin saisie avant le debut ne doit pas faire disparaitre l'evenement.
		end: end < start ? start : end,
		time: row.allDay ? null : parisTime(row.startsAt),
		href: null,
		ownerId: null
	};
}

/* ------------------------------------------------------------------------ */
/* Taches                                                                   */
/* ------------------------------------------------------------------------ */

export const TASK_STATUSES = {
	TODO: 'À faire',
	DOING: 'En cours',
	DONE: 'Fait'
} as const;

export type TaskStatus = keyof typeof TASK_STATUSES;

export function isTaskStatus(value: string): value is TaskStatus {
	return Object.prototype.hasOwnProperty.call(TASK_STATUSES, value);
}

export interface TaskRow {
	readonly id: string;
	readonly title: string;
	readonly note: string | null;
	readonly status: TaskStatus;
	readonly dueOn: Date | null;
	readonly assigneeId: string | null;
	readonly assigneeName: string | null;
}

/** Une tache non faite dont l'echeance est passee. Le jour meme n'est pas un retard. */
export function isOverdue(task: Pick<TaskRow, 'status' | 'dueOn'>, today: string): boolean {
	return task.status !== 'DONE' && task.dueOn !== null && storedDay(task.dueOn) < today;
}

/** Une tache sans echeance n'a pas de place dans le calendrier : elle reste dans la liste. */
export function taskEntry(row: TaskRow, today: string): PlanningEntry | null {
	if (row.dueOn === null) return null;

	const day = storedDay(row.dueOn);
	const overdue = isOverdue(row, today);

	return {
		id: `task:${row.id}`,
		source: 'task',
		sourceId: row.id,
		layer: 'task',
		title: row.assigneeName ? `${row.title} (${row.assigneeName})` : row.title,
		badge: overdue ? 'En retard' : TASK_STATUSES[row.status],
		alert: overdue,
		note: row.note,
		start: day,
		end: day,
		time: null,
		href: null,
		ownerId: row.assigneeId
	};
}

/* ------------------------------------------------------------------------ */
/* Presences et absences                                                    */
/* ------------------------------------------------------------------------ */

export const AVAILABILITY_KINDS = {
	PRESENT: 'Présent',
	ABSENT: 'Absent'
} as const;

export type AvailabilityKindKey = keyof typeof AVAILABILITY_KINDS;

export function isAvailabilityKind(value: string): value is AvailabilityKindKey {
	return Object.prototype.hasOwnProperty.call(AVAILABILITY_KINDS, value);
}

export interface AvailabilityRow {
	readonly id: string;
	readonly userId: string;
	readonly userName: string;
	readonly kind: AvailabilityKindKey;
	readonly startsOn: Date;
	readonly endsOn: Date;
	readonly note: string | null;
}

export function availabilityEntry(row: AvailabilityRow): PlanningEntry {
	const start = storedDay(row.startsOn);
	const end = storedDay(row.endsOn);

	return {
		id: `availability:${row.id}`,
		source: 'availability',
		sourceId: row.id,
		layer: 'presence',
		title: row.userName,
		badge: AVAILABILITY_KINDS[row.kind],
		alert: row.kind === 'ABSENT',
		note: row.note,
		start,
		end: end < start ? start : end,
		time: null,
		href: null,
		ownerId: row.userId
	};
}

/* ------------------------------------------------------------------------ */
/* Ce que les autres domaines datent                                        */
/* ------------------------------------------------------------------------ */

const MEDIA_STATUSES: Readonly<Record<string, string>> = {
	DRAFT: 'Brouillon',
	SCHEDULED: 'Programmé',
	PUBLISHED: 'Publié',
	ARCHIVED: 'Archivé'
};

export interface MediaRow {
	readonly id: string;
	readonly title: string;
	readonly status: string;
	readonly publishedAt: Date | null;
}

export function mediaEntry(row: MediaRow): PlanningEntry | null {
	if (row.publishedAt === null) return null;

	const day = parisDay(row.publishedAt);
	return {
		id: `media:${row.id}`,
		source: 'media',
		sourceId: row.id,
		layer: 'media',
		title: row.title,
		badge: MEDIA_STATUSES[row.status] ?? null,
		alert: false,
		note: null,
		start: day,
		end: day,
		time: row.status === 'SCHEDULED' ? parisTime(row.publishedAt) : null,
		href: `/admin/medias/${row.id}`,
		ownerId: null
	};
}

export interface CampaignRow {
	readonly id: string;
	readonly subject: string;
	readonly sentAt: Date | null;
}

/** Une campagne n'a de date qu'une fois partie : un brouillon reste dans son ecran. */
export function campaignEntry(row: CampaignRow): PlanningEntry | null {
	if (row.sentAt === null) return null;

	const day = parisDay(row.sentAt);
	return {
		id: `campaign:${row.id}`,
		source: 'campaign',
		sourceId: row.id,
		layer: 'editorial',
		title: row.subject,
		badge: 'Infolettre envoyée',
		alert: false,
		note: null,
		start: day,
		end: day,
		time: parisTime(row.sentAt),
		href: `/admin/infolettre/campagnes/${row.id}`,
		ownerId: null
	};
}

export interface SurveyRow {
	readonly id: string;
	readonly title: string;
	readonly fieldworkStart: Date | null;
	readonly fieldworkEnd: Date | null;
	readonly opensAt: Date | null;
	readonly closesAt: Date | null;
	readonly publishedAt: Date | null;
}

/**
 * Les jalons d'une enquete.
 *
 * Des jalons et non une bande continue : un terrain de deux mois poserait la
 * meme etiquette sur soixante cases et noierait tout le reste. Le debut et la
 * fin suffisent a voir ou l'on en est.
 */
export function surveyEntries(row: SurveyRow): PlanningEntry[] {
	const milestones: [string, Date | null][] = [
		['Début du terrain', row.fieldworkStart],
		['Fin du terrain', row.fieldworkEnd],
		['Ouverture du questionnaire', row.opensAt],
		['Clôture du questionnaire', row.closesAt],
		['Publication des résultats', row.publishedAt]
	];

	return milestones.flatMap(([badge, date], index) => {
		if (date === null) return [];

		const day = parisDay(date);
		return [
			{
				id: `survey:${row.id}:${index}`,
				source: 'survey' as const,
				sourceId: row.id,
				layer: 'survey' as const,
				title: row.title,
				badge,
				alert: false,
				note: null,
				start: day,
				end: day,
				time: null,
				href: `/admin/sondages/${row.id}`,
				ownerId: null
			}
		];
	});
}

/* ------------------------------------------------------------------------ */
/* Rangement                                                                */
/* ------------------------------------------------------------------------ */

/**
 * Ordre dans une case : les journees entieres d'abord, puis par heure, puis
 * par calque. Les presences ferment la marche : ce sont les plus nombreuses,
 * et elles ne doivent pas repousser une reunion hors de la case.
 */
function compareEntries(a: PlanningEntry, b: PlanningEntry): number {
	const layerA = LAYER_KEYS.indexOf(a.layer);
	const layerB = LAYER_KEYS.indexOf(b.layer);
	if ((a.layer === 'presence') !== (b.layer === 'presence')) return layerA - layerB;

	const timeA = a.time ?? '';
	const timeB = b.time ?? '';
	if (timeA !== timeB) return timeA < timeB ? -1 : 1;
	if (layerA !== layerB) return layerA - layerB;
	return a.title.localeCompare(b.title, 'fr');
}

/** Les entrees de chaque jour demande, rangees. Un jour sans entree a une liste vide. */
export function entriesByDay(
	entries: readonly PlanningEntry[],
	days: readonly string[]
): Record<string, PlanningEntry[]> {
	const byDay: Record<string, PlanningEntry[]> = {};
	for (const day of days) byDay[day] = [];

	for (const entry of entries) {
		for (const day of days) {
			if (day >= entry.start && day <= entry.end) byDay[day]!.push(entry);
		}
	}

	for (const day of days) byDay[day]!.sort(compareEntries);
	return byDay;
}

/** Ne garde que les calques demandes. */
export function onLayers(
	entries: readonly PlanningEntry[],
	layers: readonly PlanningLayer[]
): PlanningEntry[] {
	return entries.filter((entry) => layers.includes(entry.layer));
}

/**
 * Les calques demandes dans l'adresse (`?calques=survey,media`).
 *
 * Absent : tous. Une liste ou rien n'est reconnu vaut aussi tous : une adresse
 * abimee ne doit pas montrer un calendrier vide qu'on prendrait pour un mois
 * calme.
 */
export function parseLayers(param: string | null): PlanningLayer[] {
	if (param === null) return [...LAYER_KEYS];

	const layers = param.split(',').filter(isLayer);
	return layers.length === 0 ? [...LAYER_KEYS] : LAYER_KEYS.filter((key) => layers.includes(key));
}

/**
 * L'adresse d'un planning : son mois et ses calques.
 *
 * Tous les calques, ou aucun, ne s'ecrivent pas : les deux valent « tout »
 * (`parseLayers`), et une adresse qui dirait « aucun » montrerait le
 * contraire de ce qu'elle annonce.
 */
export function planningQuery(month: string, layers: readonly PlanningLayer[]): string {
	const params = new URLSearchParams({ mois: month });
	if (layers.length > 0 && layers.length < LAYER_KEYS.length) {
		params.set('calques', LAYER_KEYS.filter((key) => layers.includes(key)).join(','));
	}
	return `?${params}`;
}

/** Les calques apres un clic sur l'un d'eux : on l'allume ou on l'eteint. */
export function toggleLayer(
	layers: readonly PlanningLayer[],
	layer: PlanningLayer
): PlanningLayer[] {
	return layers.includes(layer) ? layers.filter((key) => key !== layer) : [...layers, layer];
}
