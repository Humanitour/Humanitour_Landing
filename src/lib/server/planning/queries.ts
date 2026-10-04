import type { SessionUser } from '$lib/server/auth/session';
import { prisma } from '$lib/server/db';
import { addDays, dayToDate, storedDay } from '$lib/shared/planning/calendar';
import {
	availabilityEntry,
	campaignEntry,
	eventEntry,
	isOverdue,
	mediaEntry,
	surveyEntries,
	taskEntry,
	type PlanningEntry,
	type TaskStatus
} from '$lib/shared/planning/entries';
import { can } from '$lib/shared/permissions';

/**
 * Les lectures du planning.
 *
 * Chaque provenance n'est lue que si le compte a le droit de la lire ailleurs :
 * le planning ne doit pas devenir la porte derobee qui montre un brouillon de
 * media a qui n'a pas `media.read`. Un calque refuse est simplement vide.
 */

export interface PlanningRange {
	/** Premier et dernier jour affiches, bornes incluses. */
	readonly from: string;
	readonly to: string;
}

/**
 * Les instants qui encadrent une periode de jours parisiens.
 *
 * Un jour de Paris commence la veille au soir en UTC. Elargir d'un jour de
 * chaque cote attrape les bords ; ce qui deborde est ecarte ensuite par la
 * grille, qui ne range que ses propres jours.
 */
function instants(range: PlanningRange) {
	return {
		gte: new Date(`${addDays(range.from, -1)}T00:00:00Z`),
		lt: new Date(`${addDays(range.to, 2)}T00:00:00Z`)
	};
}

async function events(range: PlanningRange): Promise<PlanningEntry[]> {
	const window = instants(range);
	const rows = await prisma.planningEvent.findMany({
		where: {
			startsAt: { lt: window.lt },
			OR: [{ endsAt: { gte: window.gte } }, { endsAt: null, startsAt: { gte: window.gte } }]
		},
		orderBy: { startsAt: 'asc' }
	});

	return rows.map(eventEntry);
}

async function tasksOnCalendar(range: PlanningRange, today: string): Promise<PlanningEntry[]> {
	const rows = await prisma.planningTask.findMany({
		where: { dueOn: { gte: dayToDate(range.from)!, lte: dayToDate(range.to)! } },
		include: { assignee: { select: { displayName: true } } }
	});

	return rows.flatMap((row) => {
		const entry = taskEntry({ ...row, assigneeName: row.assignee?.displayName ?? null }, today);
		return entry ? [entry] : [];
	});
}

async function availabilities(range: PlanningRange): Promise<PlanningEntry[]> {
	const rows = await prisma.teamAvailability.findMany({
		where: { startsOn: { lte: dayToDate(range.to)! }, endsOn: { gte: dayToDate(range.from)! } },
		include: { user: { select: { displayName: true } } }
	});

	return rows.map((row) => availabilityEntry({ ...row, userName: row.user.displayName }));
}

async function medias(range: PlanningRange): Promise<PlanningEntry[]> {
	const rows = await prisma.mediaItem.findMany({
		where: { publishedAt: instants(range) },
		select: { id: true, title: true, status: true, publishedAt: true }
	});

	return rows.flatMap((row) => {
		const entry = mediaEntry(row);
		return entry ? [entry] : [];
	});
}

async function campaigns(range: PlanningRange): Promise<PlanningEntry[]> {
	const rows = await prisma.newsletterCampaign.findMany({
		where: { sentAt: instants(range) },
		select: { id: true, subject: true, sentAt: true }
	});

	return rows.flatMap((row) => {
		const entry = campaignEntry(row);
		return entry ? [entry] : [];
	});
}

async function surveys(range: PlanningRange): Promise<PlanningEntry[]> {
	const window = instants(range);
	const rows = await prisma.survey.findMany({
		where: {
			OR: [
				{ fieldworkStart: window },
				{ fieldworkEnd: window },
				{ opensAt: window },
				{ closesAt: window },
				{ publishedAt: window }
			]
		},
		select: {
			id: true,
			title: true,
			fieldworkStart: true,
			fieldworkEnd: true,
			opensAt: true,
			closesAt: true,
			publishedAt: true
		}
	});

	return rows.flatMap(surveyEntries);
}

/** Toutes les entrees de la periode que ce compte a le droit de voir. */
export async function planningEntries(
	user: SessionUser,
	range: PlanningRange,
	today: string
): Promise<PlanningEntry[]> {
	const none = Promise.resolve([] as PlanningEntry[]);
	const canCampaigns = can(user, 'newsletter.read') || can(user, 'newsletter.send');

	const groups = await Promise.all([
		events(range),
		tasksOnCalendar(range, today),
		availabilities(range),
		can(user, 'media.read') ? medias(range) : none,
		canCampaigns ? campaigns(range) : none,
		can(user, 'survey.read') ? surveys(range) : none
	]);

	return groups.flat();
}

export interface TaskItem {
	readonly id: string;
	readonly title: string;
	readonly note: string | null;
	readonly status: TaskStatus;
	readonly dueOn: string | null;
	readonly overdue: boolean;
	readonly assigneeId: string | null;
	readonly assigneeName: string | null;
}

/** Combien de jours une tache faite reste dans la liste, pour qu'on la voie partir. */
const DONE_VISIBLE_DAYS = 14;

/**
 * La liste des taches : tout ce qui reste a faire, plus ce qui vient d'etre
 * fait. Les taches de chacun d'abord, puis par echeance, les taches sans date
 * en dernier.
 */
export async function taskList(user: SessionUser, today: string): Promise<TaskItem[]> {
	const since = new Date(Date.now() - DONE_VISIBLE_DAYS * 24 * 60 * 60 * 1000);
	const rows = await prisma.planningTask.findMany({
		where: { OR: [{ status: { not: 'DONE' } }, { completedAt: { gte: since } }] },
		include: { assignee: { select: { displayName: true } } },
		orderBy: [{ dueOn: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
		take: 200
	});

	const items = rows.map((row) => ({
		id: row.id,
		title: row.title,
		note: row.note,
		status: row.status,
		dueOn: row.dueOn ? storedDay(row.dueOn) : null,
		overdue: isOverdue(row, today),
		assigneeId: row.assigneeId,
		assigneeName: row.assignee?.displayName ?? null
	}));

	const rank = (item: TaskItem) =>
		item.status === 'DONE' ? 2 : item.assigneeId === user.id ? 0 : 1;
	return items.sort((a, b) => rank(a) - rank(b));
}

export interface Member {
	readonly id: string;
	readonly name: string;
}

export async function activeMembers(): Promise<Member[]> {
	const rows = await prisma.user.findMany({
		where: { isActive: true },
		orderBy: { displayName: 'asc' },
		select: { id: true, displayName: true }
	});

	return rows.map((row) => ({ id: row.id, name: row.displayName }));
}
