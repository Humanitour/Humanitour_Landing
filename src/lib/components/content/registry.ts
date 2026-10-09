import type { Component } from 'svelte';
import CardsBlock from './CardsBlock.svelte';
import CatalogueBlock from './CatalogueBlock.svelte';
import CoverBlock from './CoverBlock.svelte';
import CtaBlock from './CtaBlock.svelte';
import DefinitionsBlock from './DefinitionsBlock.svelte';
import EmbedBlock from './EmbedBlock.svelte';
import FigureGridBlock from './FigureGridBlock.svelte';
import GalleryBlock from './GalleryBlock.svelte';
import NewsletterBlock from './NewsletterBlock.svelte';
import PullQuoteBlock from './PullQuoteBlock.svelte';
import SelectionBlock from './SelectionBlock.svelte';
import SplitBlock from './SplitBlock.svelte';
import StepsBlock from './StepsBlock.svelte';
import TableBlock from './TableBlock.svelte';
import TeamBlock from './TeamBlock.svelte';
import TextBlock from './TextBlock.svelte';

/**
 * Ce que chaque type de section devient a l'ecran.
 *
 * C'est le seul endroit du site ou une cle de section rencontre un composant.
 * `ContentBlocks` ne connait aucun type : il lit cette table. Ajouter une
 * section, c'est donc un fichier dans `shared/content/blocks/`, un composant
 * ici, et une ligne dans cette table — jamais un `if` de plus dans une page.
 *
 * Une cle absente de la table ne casse rien : la section ne s'affiche pas.
 * Retirer un type de section ne doit pas mettre le site par terre, et une page
 * qui en contient un ancien doit rester lisible le temps qu'on la corrige.
 */
export interface SectionProps {
	readonly id: string;
	readonly data: Readonly<Record<string, unknown>>;
}

const REGISTRY: Readonly<Record<string, Component<SectionProps>>> = {
	cover: CoverBlock,
	text: TextBlock,
	split: SplitBlock,
	'pull-quote': PullQuoteBlock,
	definitions: DefinitionsBlock,
	steps: StepsBlock,
	'figure-grid': FigureGridBlock,
	cards: CardsBlock,
	table: TableBlock,
	team: TeamBlock,
	gallery: GalleryBlock,
	embed: EmbedBlock,
	catalogue: CatalogueBlock,
	selection: SelectionBlock,
	newsletter: NewsletterBlock,
	cta: CtaBlock
};

export function sectionComponent(key: string): Component<SectionProps> | null {
	return REGISTRY[key] ?? null;
}

/** Les cles qui savent s'afficher. Sert au test qui compare avec le registre. */
export const RENDERED_BLOCK_KEYS = Object.keys(REGISTRY);
