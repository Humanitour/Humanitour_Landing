<script lang="ts">
	import { SPACING_KEYS, SURFACE_KEYS } from '$lib/shared/content/blocks/common';
	import { SELECTION_COUNTS } from '$lib/shared/content/blocks/selection';
	import { getContentContext } from './context';
	import { sectionReader } from './read';
	import Section from './Section.svelte';
	import { borderClass, mutedClass } from './surfaces';

	interface Props {
		id: string;
		data: Readonly<Record<string, unknown>>;
	}

	let { id, data }: Props = $props();

	const page = getContentContext();
	const read = $derived(sectionReader(data, page.tokens));

	const surface = $derived(read.choice('surface', SURFACE_KEYS, 'cream'));
	const spacing = $derived(read.choice('spacing', SPACING_KEYS, 'normal'));
	const count = $derived(Number(read.choice('count', SELECTION_COUNTS, '3')));

	const title = $derived(read.text('title'));
	const intro = $derived(read.text('intro'));
	const items = $derived((page.selection ?? []).slice(0, count));
</script>

<!--
	La selection de l equipe, sur une page de contenu.

	Les cartes se valent : c est l ordre choisi par l equipe qui les
	hierarchise, pas leur taille. Aucune ne porte de chiffre ; le lien ouvre la
	fiche de l enquete sur le croisement, ou se lisent la base et les seuils.
-->
<Section
	{surface}
	{spacing}
	labelledby={title ? id : undefined}
	label={title ? undefined : 'Sélection de l’équipe'}
>
	{#if title}<h2 {id} class="text-2xl sm:text-3xl" data-field="title">{title}</h2>{/if}
	{#if intro}
		<p class="measure mt-4 leading-relaxed {mutedClass(surface)}" data-field="intro">{intro}</p>
	{/if}

	{#if items.length === 0}
		<p class="measure mt-8 leading-relaxed" data-field="emptyText">{read.text('emptyText')}</p>
	{:else}
		<ol class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each items as item (item.id)}
				<li class="min-w-0">
					<a
						href={item.href}
						class="rounded-block press flex h-full flex-col border-2 p-5 {borderClass(surface)}"
					>
						<span class="text-sm {mutedClass(surface)}">{item.surveyTitle}</span>
						<h3 class="mt-2 text-lg leading-snug">{item.title}</h3>
						<p class="mt-2 text-sm {mutedClass(surface)}">
							{item.question}{item.crossedWith ? `, croisée avec ${item.crossedWith}` : ''}{item
								.filters.length > 0
								? `, parmi ${item.filters.join(' et ')}`
								: ''}.
						</p>
						{#if item.comment}
							<p class="mt-3 text-sm leading-relaxed">{item.comment}</p>
						{/if}
						<span
							class="mt-auto pt-4 text-sm font-semibold underline decoration-2 underline-offset-2"
						>
							Ouvrir le croisement
						</span>
					</a>
				</li>
			{/each}
		</ol>
	{/if}
</Section>
