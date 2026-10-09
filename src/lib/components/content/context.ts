import { getContext, setContext, type Snippet } from 'svelte';
import type { ContentTokens } from '$lib/shared/content/tokens';
import { TEAM, type TeamMember } from '$lib/shared/site';

/**
 * Ce qu'une section peut lire de la page qui l'affiche.
 *
 * Deux choses seulement, et chacune a une raison precise :
 *
 * - `tokens` porte les valeurs que le site applique vraiment — le seuil
 *   d'effectif publiable, par exemple. Un texte les cite (`{seuil}`) au lieu
 *   de les recopier, et ne peut donc pas annoncer autre chose que ce qui est
 *   applique ;
 * - `catalogue` porte la liste d'une page de catalogue (enquetes, medias,
 *   formulaires ouverts). Elle reste rendue par la page, avec sa recherche et
 *   ses filtres, parce que leurs adresses sont un contrat public. La section
 *   n'en habille que le pourtour ;
 * - `team` porte l'ordre de lecture des portraits, tire au sort A CHAQUE
 *   CHARGEMENT — sans quoi les premieres fiches recevraient toujours plus
 *   d'attention que les dernieres. Le tirage a lieu sur le serveur et descend
 *   par ici : tire dans le composant, il donnerait un ordre au rendu serveur et
 *   un autre a l'hydratation, et les portraits sauteraient sous les yeux du
 *   visiteur.
 *
 * Un contexte plutot que des props traversantes : `ContentBlocks` ne connait
 * pas les types de section, et leur passer a tous des props dont une seule se
 * sert obligerait a les declarer partout.
 */

export interface ContentCatalogue {
	/** La liste est vide : c'est le texte edite qui s'affiche a sa place. */
	readonly empty: boolean;
	/** La liste elle-meme, rendue par la page. */
	readonly body: Snippet;
	/** Ce qui se pose entre le titre et la liste : recherche, filtres, effectifs. */
	readonly controls?: Snippet;
}

/**
 * Un croisement de la selection de l'equipe, deja mis en clair par le serveur.
 * Il ne porte aucun chiffre : `href` ouvre l'explorateur sur ce croisement.
 */
export interface ContentSelectionItem {
	readonly id: string;
	readonly surveyTitle: string;
	readonly title: string;
	readonly comment: string | null;
	readonly question: string;
	readonly crossedWith: string | null;
	readonly filters: readonly string[];
	readonly href: string;
}

export interface ContentContext {
	readonly tokens: ContentTokens;
	readonly catalogue?: ContentCatalogue;
	readonly team?: readonly TeamMember[];
	/** La selection de l'equipe, pour les pages qui la chargent. */
	readonly selection?: readonly ContentSelectionItem[];
}

const KEY = Symbol('contenu');

export function setContentContext(value: ContentContext): void {
	setContext(KEY, value);
}

/** Hors de toute page : une section isolee doit rester rendable. */
const DETACHED: ContentContext = { tokens: {}, team: TEAM };

/**
 * Le contexte pose par `ContentBlocks`.
 *
 * L'objet est rendu tel quel, jamais recopie : ses champs sont des accesseurs,
 * et les recopier les evaluerait une seule fois, au montage. Les sections
 * doivent donc le lire par `contexte.tokens` et non le destructurer.
 */
export function getContentContext(): ContentContext {
	return getContext<ContentContext | undefined>(KEY) ?? DETACHED;
}
