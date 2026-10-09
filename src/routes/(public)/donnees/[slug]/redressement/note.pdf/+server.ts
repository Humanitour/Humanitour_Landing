import { error } from '@sveltejs/kit';
import { renderWeightingNotePdf } from '$lib/server/pdf/weighting-note';
import { getPublishedSurvey, resolveThreshold } from '$lib/server/survey/queries';
import { loadPublishedWeighting, loadWeightingNote } from '$lib/server/survey/weighting-store';
import type { RequestHandler } from './$types';

/**
 * La note methodologique publiee, en PDF.
 *
 * Le meme document que celui du back-office, a une difference pres : les parts
 * des marges y passent le seuil d anonymat, comme tout chiffre qui sort du
 * site. Composee a chaque demande pour decrire le calcul en vigueur.
 */
export const GET: RequestHandler = async ({ params }) => {
	const survey = await getPublishedSurvey(params.slug);
	if (!survey) error(404, { message: "Cette enquête n'existe pas ou n'est pas publiée." });

	const weighting = await loadPublishedWeighting(survey.id);
	if (!weighting) error(404, { message: "Aucun redressement n'est publié pour cette enquête." });

	const note = await loadWeightingNote(survey.id, { threshold: await resolveThreshold(survey) });
	if (!note) error(404, { message: "Aucun redressement n'est publié pour cette enquête." });

	return new Response(await renderWeightingNotePdf(note), {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${note.fileName}"`,
			'Cache-Control': 'no-store'
		}
	});
};
