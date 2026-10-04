import { error, fail } from '@sveltejs/kit';
import { recordAudit } from '$lib/server/audit';
import type { SessionUser } from '$lib/server/auth/session';
import { prisma } from '$lib/server/db';
import { readText } from '$lib/server/forms';
import { activeMembers, planningEntries, taskList } from '$lib/server/planning/queries';
import { requirePermission } from '$lib/server/rbac/guard';
import {
	addDays,
	daysBetween,
	firstDay,
	lastDay,
	monthGrid,
	monthParam,
	parisDay,
	parseMonth,
	shiftMonth
} from '$lib/shared/planning/calendar';
import {
	AVAILABILITY_KINDS,
	EVENT_KINDS,
	PLANNING_LAYERS,
	TASK_STATUSES,
	entriesByDay,
	onLayers,
	parseLayers
} from '$lib/shared/planning/entries';
import {
	parseAvailability,
	parseEvent,
	parseTask,
	parseTaskStatus
} from '$lib/shared/planning/input';
import { can } from '$lib/shared/permissions';
import type { Actions, PageServerLoad } from './$types';

/**
 * Le planning de l'equipe.
 *
 * Un mois a l'ecran, avec ce que chaque domaine date deja (publications,
 * terrains, infolettres) et ce qui n'existe qu'ici : rendez-vous, taches,
 * presences et absences. Le mois et les calques sont dans l'adresse : un
 * planning filtre se partage par un lien, comme un croisement de donnees.
 */

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requirePermission(locals.user, 'planning.read');

	const today = parisDay(new Date());
	const month = parseMonth(url.searchParams.get('mois'), today);
	const layers = parseLayers(url.searchParams.get('calques'));
	const weeks = monthGrid(month);
	const days = weeks.flat();
	const range = { from: days[0]!, to: days.at(-1)! };

	// La semaine en cours se lit a cote du mois, quel que soit le mois affiche :
	// « qui est la cette semaine » ne doit pas dependre de la page ou l'on est.
	const thisWeek = { from: today, to: addDays(today, 6) };

	const [entries, upcoming, tasks, members] = await Promise.all([
		planningEntries(user, range, today),
		planningEntries(user, thisWeek, today),
		taskList(user, today),
		activeMembers()
	]);

	const presence = upcoming.filter((entry) => entry.layer === 'presence');

	return {
		today,
		month: monthParam(month),
		monthStart: firstDay(month),
		monthEnd: lastDay(month),
		previous: monthParam(shiftMonth(month, -1)),
		next: monthParam(shiftMonth(month, 1)),
		layers,
		weeks,
		byDay: entriesByDay(onLayers(entries, layers), days),
		week: daysBetween(thisWeek.from, thisWeek.to),
		presenceWeek: entriesByDay(presence, daysBetween(thisWeek.from, thisWeek.to)),
		tasks,
		members,
		layerOptions: Object.entries(PLANNING_LAYERS).map(([key, layer]) => ({ key, ...layer })),
		eventKinds: Object.entries(EVENT_KINDS).map(([key, label]) => ({ key, label })),
		taskStatuses: Object.entries(TASK_STATUSES).map(([key, label]) => ({ key, label })),
		availabilityKinds: Object.entries(AVAILABILITY_KINDS).map(([key, label]) => ({ key, label }))
	};
};

/** Le membre vise doit exister et etre actif : on ne donne pas de tache a un compte ferme. */
async function activeMember(id: string): Promise<boolean> {
	const member = await prisma.user.findUnique({ where: { id }, select: { isActive: true } });
	return member?.isActive === true;
}

/**
 * Peut-on toucher a cette periode ? La sienne, toujours ; celle d'un autre,
 * seulement avec `planning.write`.
 */
function canEditAvailabilityOf(user: SessionUser, userId: string): boolean {
	return userId === user.id || can(user, 'planning.write');
}

export const actions: Actions = {
	createEvent: async ({ request, locals }) => {
		const user = requirePermission(locals.user, 'planning.write');
		const parsed = parseEvent(await request.formData());
		if (!parsed.ok) return fail(400, { message: parsed.reason });

		const event = await prisma.planningEvent.create({
			data: { ...parsed.value, createdById: user.id }
		});

		await recordAudit({
			actorId: user.id,
			action: 'planning.event.create',
			entity: 'PlanningEvent',
			entityId: event.id,
			metadata: { title: event.title, kind: event.kind }
		});

		return { message: 'Événement ajouté au planning.' };
	},

	deleteEvent: async ({ request, locals }) => {
		const user = requirePermission(locals.user, 'planning.write');
		const id = readText(await request.formData(), 'id');

		const event = await prisma.planningEvent.findUnique({ where: { id } });
		if (!event) return fail(404, { message: 'Cet événement n’existe plus.' });

		await prisma.planningEvent.delete({ where: { id } });
		await recordAudit({
			actorId: user.id,
			action: 'planning.event.delete',
			entity: 'PlanningEvent',
			entityId: id,
			metadata: { title: event.title }
		});

		return { message: 'Événement retiré du planning.' };
	},

	createTask: async ({ request, locals }) => {
		const user = requirePermission(locals.user, 'planning.write');
		const parsed = parseTask(await request.formData());
		if (!parsed.ok) return fail(400, { message: parsed.reason });

		const { assigneeId } = parsed.value;
		if (assigneeId !== null && !(await activeMember(assigneeId))) {
			return fail(400, { message: 'Ce membre n’existe pas ou son compte est désactivé.' });
		}

		const task = await prisma.planningTask.create({
			data: { ...parsed.value, createdById: user.id }
		});

		await recordAudit({
			actorId: user.id,
			action: 'planning.task.create',
			entity: 'PlanningTask',
			entityId: task.id,
			metadata: { title: task.title, assigneeId }
		});

		return { message: 'Tâche créée.' };
	},

	/**
	 * Faire avancer une tache. La personne a qui elle est confiee le peut sans
	 * `planning.write` : cocher son propre travail n'est pas organiser celui
	 * des autres.
	 */
	setTaskStatus: async ({ request, locals }) => {
		const user = requirePermission(locals.user, 'planning.read');
		const form = await request.formData();
		const id = readText(form, 'id');

		const status = parseTaskStatus(form);
		if (!status.ok) return fail(400, { message: status.reason });

		const task = await prisma.planningTask.findUnique({ where: { id } });
		if (!task) return fail(404, { message: 'Cette tâche n’existe plus.' });
		if (task.assigneeId !== user.id && !can(user, 'planning.write')) {
			error(403, {
				message: 'Seule la personne responsable peut faire avancer cette tâche.',
				code: 'forbidden'
			});
		}

		await prisma.planningTask.update({
			where: { id },
			data: {
				status: status.value,
				completedAt: status.value === 'DONE' ? (task.completedAt ?? new Date()) : null
			}
		});

		await recordAudit({
			actorId: user.id,
			action: 'planning.task.status',
			entity: 'PlanningTask',
			entityId: id,
			metadata: { from: task.status, to: status.value }
		});

		return { message: status.value === 'DONE' ? 'Tâche faite.' : 'Tâche mise à jour.' };
	},

	deleteTask: async ({ request, locals }) => {
		const user = requirePermission(locals.user, 'planning.write');
		const id = readText(await request.formData(), 'id');

		const task = await prisma.planningTask.findUnique({ where: { id } });
		if (!task) return fail(404, { message: 'Cette tâche n’existe plus.' });

		await prisma.planningTask.delete({ where: { id } });
		await recordAudit({
			actorId: user.id,
			action: 'planning.task.delete',
			entity: 'PlanningTask',
			entityId: id,
			metadata: { title: task.title }
		});

		return { message: 'Tâche supprimée.' };
	},

	createAvailability: async ({ request, locals }) => {
		const user = requirePermission(locals.user, 'planning.read');
		const parsed = parseAvailability(await request.formData());
		if (!parsed.ok) return fail(400, { message: parsed.reason });

		const userId = parsed.value.userId ?? user.id;
		if (!canEditAvailabilityOf(user, userId)) {
			error(403, {
				message: 'Vous ne pouvez déclarer que vos propres présences.',
				code: 'forbidden'
			});
		}
		if (!(await activeMember(userId))) {
			return fail(400, { message: 'Ce membre n’existe pas ou son compte est désactivé.' });
		}

		const period = await prisma.teamAvailability.create({
			data: { ...parsed.value, userId }
		});

		await recordAudit({
			actorId: user.id,
			action: 'planning.availability.create',
			entity: 'TeamAvailability',
			entityId: period.id,
			metadata: { userId, kind: period.kind }
		});

		return { message: period.kind === 'ABSENT' ? 'Absence enregistrée.' : 'Présence enregistrée.' };
	},

	deleteAvailability: async ({ request, locals }) => {
		const user = requirePermission(locals.user, 'planning.read');
		const id = readText(await request.formData(), 'id');

		const period = await prisma.teamAvailability.findUnique({ where: { id } });
		if (!period) return fail(404, { message: 'Cette période n’existe plus.' });
		if (!canEditAvailabilityOf(user, period.userId)) {
			error(403, {
				message: 'Vous ne pouvez retirer que vos propres présences.',
				code: 'forbidden'
			});
		}

		await prisma.teamAvailability.delete({ where: { id } });
		await recordAudit({
			actorId: user.id,
			action: 'planning.availability.delete',
			entity: 'TeamAvailability',
			entityId: id,
			metadata: { userId: period.userId, kind: period.kind }
		});

		return { message: 'Période retirée du planning.' };
	}
};
