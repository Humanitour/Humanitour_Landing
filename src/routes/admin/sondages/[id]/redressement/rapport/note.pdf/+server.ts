import { error } from '@sveltejs/kit';
import { renderWeightingNotePdf } from '$lib/server/pdf/weighting-note';
import { requirePermission } from '$lib/server/rbac/guard';
import { loadWeightingNote } from '$lib/server/survey/weighting-store';
import type { RequestHandler } from './$types';

/**
 * La note methodologique du dernier calcul, en PDF.
 *
 * Composee a chaque demande, jamais mise en cache : le fichier remis a un
 * partenaire doit decrire le calcul en vigueur, pas celui d'hier.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	requirePermission(locals.user, 'survey.read');

	const note = await loadWeightingNote(params.id);
	if (!note) error(404, { message: 'Aucun redressement calculé pour ce sondage.' });

	const pdf = await renderWeightingNotePdf(note);

	return new Response(pdf, {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${note.fileName}"`,
			'Cache-Control': 'no-store'
		}
	});
};
