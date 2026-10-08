import { requirePermission } from '$lib/server/rbac/guard';
import { loadWeightingNote } from '$lib/server/survey/weighting-store';
import type { PageServerLoad } from './$types';

/**
 * Onglet 5 : la note methodologique et l export des poids.
 *
 * La page affiche la meme note que le PDF telecharge : les deux viennent de
 * `composeWeightingNote`.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	requirePermission(locals.user, 'survey.read');

	return { note: await loadWeightingNote(params.id) };
};
