import { cardsType } from './blocks/cards';
import { catalogueType } from './blocks/catalogue';
import { coverType } from './blocks/cover';
import { ctaType } from './blocks/cta';
import { definitionsType } from './blocks/definitions';
import { embedType } from './blocks/embed';
import { figureGridType } from './blocks/figure-grid';
import { galleryType } from './blocks/gallery';
import { newsletterType } from './blocks/newsletter';
import { pullQuoteType } from './blocks/pull-quote';
import { selectionType } from './blocks/selection';
import { splitType } from './blocks/split';
import { stepsType } from './blocks/steps';
import { tableType } from './blocks/table';
import { teamType } from './blocks/team';
import { textType } from './blocks/text';
import {
	CONTENT_BLOCK_GROUPS,
	type ContentBlockGroup,
	type ContentBlockType,
	type ContentPageKey
} from './types';

/**
 * Registre des sections du site.
 *
 * Ajouter une section : ecrire son fichier dans `blocks/`, l'ajouter a cette
 * liste, lui donner son composant dans `components/content/registry.ts`. Rien
 * d'autre — ni colonne en base, ni `switch` dans une page.
 *
 * L'ordre est celui de la bibliotheque au back-office : on commence par
 * couvrir la page, on finit par appeler a agir.
 */
const REGISTERED: readonly ContentBlockType[] = [
	coverType,
	textType,
	splitType,
	pullQuoteType,
	definitionsType,
	stepsType,
	figureGridType,
	cardsType,
	tableType,
	teamType,
	galleryType,
	embedType,
	catalogueType,
	selectionType,
	newsletterType,
	ctaType
];

const BY_KEY = new Map(REGISTERED.map((type) => [type.key, type]));

export const CONTENT_BLOCK_TYPES = REGISTERED;

export function getContentBlockType(key: string): ContentBlockType | null {
	return BY_KEY.get(key) ?? null;
}

export function requireContentBlockType(key: string): ContentBlockType {
	const type = BY_KEY.get(key);
	if (!type) throw new Error(`Type de section inconnu : « ${key} ».`);
	return type;
}

/** La bibliotheque rangee par famille, pour le catalogue du back-office. */
export function contentBlockLibrary(): readonly {
	readonly key: ContentBlockGroup;
	readonly label: string;
	readonly types: readonly ContentBlockType[];
}[] {
	return CONTENT_BLOCK_GROUPS.map((group) => ({
		...group,
		types: REGISTERED.filter((type) => type.group === group.key)
	})).filter((group) => group.types.length > 0);
}

/**
 * Les pages editables, dans l'ordre du menu du back-office.
 *
 * Liste fermee : ce sont les pages du site qui existent, pas un constructeur
 * de pages arbitraires. Une page ajoutee ici doit exister cote public, et sa
 * route doit rendre ses sections.
 */
export const CONTENT_PAGES: readonly {
	readonly key: ContentPageKey;
	readonly label: string;
	readonly href: string;
	readonly description: string;
}[] = [
	{
		key: 'HOME',
		label: 'Accueil',
		href: '/',
		description: "La page d'accueil : couverture, écarts de sondage, terrain, équipe, engagements."
	},
	{
		key: 'ABOUT',
		label: "L'institut",
		href: '/a-propos',
		description:
			"Qui est l'institut : sa vision, ses valeurs, son équipe, son histoire et son identité déclarée."
	},
	{
		key: 'TOUR',
		label: 'Le tour',
		href: '/le-tour',
		description: 'Le récit du tour de France à vélo, sa méthode et son carnet de route.'
	},
	{
		key: 'METHOD',
		label: 'Méthodologie',
		href: '/methodologie',
		description: 'Les règles de collecte, de publication, de conservation et de réutilisation.'
	},
	{
		key: 'GALLERY',
		label: 'Galerie',
		href: '/galerie',
		description: 'Les photographies du tour.'
	},
	{
		key: 'DATA',
		label: 'Les données',
		href: '/donnees',
		description: 'Le catalogue des enquêtes publiées et de leurs données brutes.'
	},
	{
		key: 'MEDIA',
		label: 'Médias',
		href: '/medias',
		description: 'La médiathèque : articles, vidéos, podcasts et revue de presse.'
	},
	{
		key: 'ANSWER',
		label: 'Répondre',
		href: '/repondre',
		description: 'Les enquêtes encore ouvertes aux réponses.'
	}
];

export function getContentPage(key: string) {
	return CONTENT_PAGES.find((page) => page.key === key) ?? null;
}

export * from './types';
