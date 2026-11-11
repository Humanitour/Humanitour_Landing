import { fail } from '@sveltejs/kit';
import { recordAudit } from '$lib/server/audit';
import { prisma } from '$lib/server/db';
import { readOptionalInt } from '$lib/server/forms';
import { requirePermission } from '$lib/server/rbac/guard';
import { DEFAULT_K_THRESHOLD, pickThreshold } from '$lib/server/survey/anonymity';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requirePermission(locals.user, 'settings.manage');

	const setting = await prisma.appSetting.findUnique({
		where: { key: 'anonymity.k' },
		include: { updatedBy: { select: { displayName: true } } }
	});

	return {
		threshold: pickThreshold(null, setting?.value),
		defaultThreshold: DEFAULT_K_THRESHOLD,
		updatedAt: setting?.updatedAt ?? null,
		updatedBy: setting?.updatedBy?.displayName ?? null
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = requirePermission(locals.user, 'settings.manage');

		const form = await request.formData();

		// Un seuil de 1 ne masque plus rien : voulu, les tableaux ne sont plus
		// proteges. L'audit ci-dessous garde la trace de la decision.
		const threshold = readOptionalInt(form, 'threshold', 1);

		if (!threshold.ok || threshold.value === null) {
			return fail(400, {
				message: 'Le seuil doit etre un entier superieur ou egal a 1 (1 = rien n est masque).'
			});
		}

		await prisma.appSetting.upsert({
			where: { key: 'anonymity.k' },
			create: { key: 'anonymity.k', value: threshold.value, updatedById: user.id },
			update: { value: threshold.value, updatedById: user.id }
		});

		// Le seuil conditionne tout ce qui est publie : le changer est une decision
		// tracee, pas un reglage anodin.
		await recordAudit({
			actorId: user.id,
			action: 'settings.update',
			entity: 'AppSetting',
			entityId: 'anonymity.k',
			metadata: { value: threshold.value }
		});

		return { message: `Seuil d anonymat fixe a ${threshold.value}.` };
	}
};
