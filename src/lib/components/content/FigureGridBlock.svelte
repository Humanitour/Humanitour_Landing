<script lang="ts">
	import Stat from '$components/Stat.svelte';
	import { SPACING_KEYS, SURFACE_KEYS } from '$lib/shared/content/blocks/common';
	import { getContentContext } from './context';
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

	const surface = $derived(read.choice('surface', SURFACE_KEYS, 'ink'));
	const spacing = $derived(read.choice('spacing', SPACING_KEYS, 'compact'));
	const columns = $derived(read.choice('columns', ['2', '3', '4'] as const, '4'));
	const style = $derived(read.choice('style', ['affiche', 'cartes'] as const, 'affiche'));

	const title = $derived(read.text('title'));
	const intro = $derived(read.text('intro'));
	const items = $derived(read.list('items'));

	/*
	 * UNE SEULE colonne sous `sm`, et c'est mesure, pas esthetique : Bowlby One
	 * est tres large et les chiffres ne se coupent pas, donc « 4 000 km » deborde
	 * d'une demi-colonne de telephone et vient chevaucher son voisin. Ca se
	 * reverifie a 320 px.
	 */
	const GRID: Record<string, string> = {
		'2': 'sm:grid-cols-2',
		'3': 'sm:grid-cols-2 lg:grid-cols-3',
		'4': 'sm:grid-cols-2 lg:grid-cols-4'
	};
</script>

<Section {surface} {spacing} labelledby={title ? id : undefined} label={title ? undefined : 'Chiffres clés'}>
	{#if title}<h2 {id} class="font-display text-2xl sm:text-3xl" data-field="title">{title}</h2>{/if}
	{#if intro}
		<p class="measure mt-3 text-base leading-relaxed {mutedClass(surface)}" data-field="intro">{intro}</p>
	{/if}

	<dl class="grid gap-6 {GRID[columns]}" class:mt-10={title !== null || intro !== null}>
		{#each items as item, index (index)}
			{@const value = read.itemText(item, 'value') ?? ''}
			{@const label = read.itemText(item, 'label') ?? ''}
			{@const hint = read.itemText(item, 'hint')}

			{#if style === 'cartes'}
				<div class="block-card p-6">
					<dt class="font-display text-3xl" data-field="items.{index}.value">{value}</dt>
					<dd class="text-muted mt-2 text-sm">
						<span class="block" data-field="items.{index}.label">{label}</span>
						{#if hint}<span class="mt-1 block" data-field="items.{index}.hint">{hint}</span>{/if}
					</dd>
				</div>
			{:else}
				<!--
					Chiffre d'affiche, compose dans la fonte de titrage comme sur les
					documents imprimes. Le couple terme/definition reste porte par `dl`,
					`Stat` n'en habille que l'interieur.
				-->
				<div
					class={surface === 'ink'
						? 'rounded-block border border-white/12 bg-white/[0.04] p-6 shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]'
						: 'block-card p-6'}
				>
					<dt class="sr-only">{label}</dt>
					<dd><Stat {value} {label} hint={hint ?? undefined} /></dd>
				</div>
			{/if}
		{/each}
	</dl>
</Section>
