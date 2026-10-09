<script lang="ts">
	import {
		setContentContext,
		type ContentCatalogue,
		type ContentSelectionItem
	} from './content/context';
	import { sectionComponent } from './content/registry';
	import type { ContentBlockRecord } from '$lib/shared/content';
	import type { ContentTokens } from '$lib/shared/content/tokens';
	import type { TeamMember } from '$lib/shared/site';

	interface Props {
		blocks: readonly ContentBlockRecord[];
		/** Les valeurs que le site applique vraiment, citees par les textes. */
		tokens?: ContentTokens;
		/** L'ordre de lecture des portraits, tire sur le serveur. */
		team?: readonly TeamMember[];
		/** La liste d'une page de catalogue, rendue par la page elle-meme. */
		catalogue?: ContentCatalogue;
		/** La selection de l'equipe, pour les pages qui la chargent. */
		selection?: readonly ContentSelectionItem[];
	}

	let { blocks, tokens = {}, team, catalogue, selection }: Props = $props();

	/*
	 * Des accesseurs et non les valeurs : pose telles quelles, elles figeraient
	 * l'etat du premier rendu. Deux recherches successives sur `/donnees`
	 * reutilisent ce composant, et la seconde afficherait l'etat vide de la
	 * premiere.
	 */
	setContentContext({
		get tokens() {
			return tokens;
		},
		get team() {
			return team;
		},
		get catalogue() {
			return catalogue;
		},
		get selection() {
			return selection;
		}
	});
</script>

<!--
	Les sections de la page, dans l'ordre ou le back-office les a rangees.

	Ce fichier ne connait aucun type de section : il lit le registre de rendu. Il
	n'y a donc pas de `switch` a tenir a jour quand la bibliotheque s'etoffe, et
	une section dont le type a disparu du registre ne s'affiche simplement pas,
	sans emporter la page avec elle.

	L'identifiant de section sert d'ancre au titre : c'est ce qui permet a
	`aria-labelledby` de nommer chaque region sans que deux sections d'une meme
	page portent le meme identifiant.
-->
{#each blocks as block (block.id)}
	{@const Section = sectionComponent(block.type)}
	{#if Section}
		<Section id="section-{block.id}" data={block.data} />
	{/if}
{/each}
