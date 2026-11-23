<script lang="ts">
	import { SPACING_KEYS, SURFACE_KEYS } from '$lib/shared/content/blocks/common';
	import { getContentContext } from './context';
	import Marked from './Marked.svelte';
	import { sectionReader } from './read';
	import Section from './Section.svelte';
	import { mutedClass } from './surfaces';

	interface Props {
		id: string;
		data: Readonly<Record<string, unknown>>;
	}

	let { id, data }: Props = $props();

	const page = getContentContext();
	const read = $derived(sectionReader(data, page.tokens));

	const surface = $derived(read.choice('surface', SURFACE_KEYS, 'paper'));
	const spacing = $derived(read.choice('spacing', SPACING_KEYS, 'ample'));

	const title = $derived(read.text('title'));
	const intro = $derived(read.text('intro'));
	const items = $derived(read.list('items'));
	const note = $derived(read.text('note'));

	/* Le corail sombre est illisible sur l'aplat noir (3,3:1). */
	const figureClass = $derived(surface === 'ink' ? 'text-coral' : 'text-coral-ink');

	const GRID: Record<number, string> = {
		1: '',
		2: 'md:grid-cols-2',
		3: 'md:grid-cols-3',
		4: 'sm:grid-cols-2 lg:grid-cols-4'
	};
</script>

<Section {surface} {spacing} labelledby={title ? id : undefined}>
	{#if title}
		<h2 {id} class="max-w-3xl" data-field="title">
			<Marked
				text={title}
				highlight={read.text('highlight')}
				style={read.raw('highlightStyle') ?? 'brand'}
			/>
		</h2>
	{/if}

	{#if intro}
		<p class="measure mt-6 text-lg leading-relaxed" data-field="intro">{intro}</p>
	{/if}

	<div class="mt-14 grid gap-6 {GRID[items.length] ?? GRID[3]}">
		{#each items as item, index (index)}
			<div
				class={surface === 'ink'
					? 'rounded-block border border-white/12 bg-white/[0.04] p-6 shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] sm:p-7'
					: 'block-card p-6 sm:p-7'}
			>
				<p
					class="font-display text-3xl leading-none sm:text-4xl {figureClass}"
					data-field="items.{index}.figure"
				>{read.itemText(item, 'figure')}</p>
				<p
					class="mt-3 leading-relaxed {mutedClass(surface)}"
					data-field="items.{index}.body"
				>{read.itemText(item, 'body')}</p>
			</div>
		{/each}
	</div>

	{#if note}
		<!-- Un gris fige tombe a 2,6:1 sur l'aplat noir : la note y baisse
		     l'opacite de la couleur heritee au lieu de changer de couleur. -->
		<p class="mt-10 text-sm {surface === 'ink' ? 'opacity-75' : 'text-muted'}" data-field="note">{note}</p>
	{/if}
</Section>
