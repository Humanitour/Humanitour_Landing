import { error } from '@sveltejs/kit';
import { parseExploreParams } from '$shared/explore';
import { buildOutcome, buildPanels } from '$lib/server/survey/explore';
import { getPublishedSurvey, prepareExplore } from '$lib/server/survey/queries';
import { panelsToCsv, resultToCsv } from '$lib/server/survey/result-csv';
import type { RequestHandler } from './$types';

/**
 * Le resultat AFFICHE, en CSV, filtres compris.
 *
 * Distinct de `export.csv`, qui donne l enquete entiere reponse par reponse.
 * Celui-ci accompagne un graphique qu on reprend : les chiffres exacts qui ont
 * produit l image, et rien d autre. Il prend les memes parametres que la page,
 * donc l adresse d un croisement se transforme en fichier en changeant un seul
 * segment.
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	const survey = await getPublishedSurvey(params.slug);
	if (!survey) error(404, { message: "Cette enquete n'existe pas ou n'est pas publiee." });

	const requested = parseExploreParams(url.searchParams);
	const unmasked = locals.user !== null;
	const prepared = await prepareExplore(survey, requested, { unmasked });
	if (!prepared) error(500, { message: 'Cette enquete ne comporte aucune question exploitable.' });

	const inputs = {
		x: prepared.x,
		y: prepared.y,
		population: prepared.population,
		threshold: prepared.threshold,
		includeNonResponses: requested.includeNonResponses,
		weights: prepared.weights
	};

	// Decoupe en panneaux, le fichier gagne une colonne plutot qu une structure
	// imbriquee : il reste ouvrable dans un tableur.
	const csv = prepared.z
		? panelsToCsv(buildPanels(inputs, prepared.z))
		: resultToCsv(buildOutcome(inputs));

	// Le nom du fichier porte le croisement : trois exports dans un dossier de
	// telechargements doivent rester distinguables sans etre ouverts.
	const axes = [prepared.x.code, prepared.y?.code, prepared.z?.code].filter(Boolean).join('-par-');
	// Un fichier redresse ne doit pas pouvoir passer pour le brut une fois
	// sorti de son contexte : la lecture est dans le nom.
	const reading = prepared.weights ? '-redresse' : '';
	const filename = `humanitour-${survey.slug}-${axes}${reading}.csv`;

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`,
			// Les chiffres non masques de l equipe ne doivent pas atterrir dans un
			// cache partage, ou un visiteur les recevrait.
			'Cache-Control': unmasked ? 'private, no-store' : 'public, max-age=300'
		}
	});
};
