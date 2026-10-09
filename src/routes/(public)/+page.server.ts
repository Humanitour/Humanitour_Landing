import { pageBlocks } from '$lib/server/content/queries';
import { featuredSelection } from '$lib/server/survey/queries';
import { SELECTION_COUNTS } from '$lib/shared/content/blocks/selection';
import type { PageServerLoad } from './$types';

/** Le plus grand nombre de croisements qu une section « Sélection » peut demander. */
const SELECTION_MAX = Math.max(...SELECTION_COUNTS.map(Number));

export const load: PageServerLoad = async () => {
	const blocks = await pageBlocks('HOME');
	// Lue seulement si l accueil porte la section : sinon, rien a charger.
	const featured = blocks.some((block) => block.type === 'selection')
		? await featuredSelection(SELECTION_MAX)
		: [];

	return {
		blocks,
		selection: featured.map(({ survey, card }) => ({
			id: card.id,
			surveyTitle: survey.title,
			title: card.title,
			comment: card.comment,
			question: card.question,
			crossedWith: card.crossedWith,
			filters: card.filters,
			href: `/donnees/${survey.slug}?${card.search}#explorateur`
		}))
	};
};
