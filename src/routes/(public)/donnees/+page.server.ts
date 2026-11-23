import { redirect } from '@sveltejs/kit';
import { pageBlocks } from '$lib/server/content/queries';
import { listPublishedSurveys, listPublishedThemes } from '$lib/server/survey/queries';
import type { PageServerLoad } from './$types';

/**
 * Catalogue des enquetes.
 *
 * `?q=` cherche dans les titres, les descriptions et les LIBELLES DE QUESTIONS.
 * `?theme=` restreint a un mot-cle. Les deux se cumulent, et une combinaison
 * sans resultat n est pas une erreur : c est une reponse, et la page le dit.
 *
 * Un theme inconnu ne vide pas la page par accident : il ne correspond a
 * aucune enquete, et l etat vide explique ou la recherche a porte.
 */
export const load: PageServerLoad = async ({ url }) => {
	const search = url.searchParams.get('q')?.trim() ?? '';
	const theme = url.searchParams.get('theme')?.trim() ?? '';

	const [surveys, themes, blocks] = await Promise.all([
		listPublishedSurveys(search, theme),
		listPublishedThemes(),
		pageBlocks('DATA')
	]);

	// Tant qu'un seul sondage est publié et qu'aucun filtre n'est actif,
	// on évite une étape catalogue inutile et on ouvre directement ses résultats.
	if (!search && !theme && surveys.length === 1) {
		redirect(307, `/donnees/${surveys[0]!.slug}`);
	}

	return { surveys, themes, search, theme, blocks };
};
