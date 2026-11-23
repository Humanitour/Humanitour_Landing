<script lang="ts">
	import { SPACING_KEYS, SURFACE_KEYS } from '$lib/shared/content/blocks/common';
	import Buttons from './Buttons.svelte';
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

	const surface = $derived(read.choice('surface', SURFACE_KEYS, 'paper'));
	const spacing = $derived(read.choice('spacing', SPACING_KEYS, 'normal'));

	const title = $derived(read.text('title'));
	const intro = $derived(read.text('intro'));
	const items = $derived(read.list('items'));
</script>

<!--
	Colonne etroite a gauche, liste numerotee a droite.

	La numerotation dit que l'ordre compte. Pour les questions de terrain, cet
	ordre EST une donnee : le libelle et le rang de passation font partie du
	resultat.
-->
<Section {surface} {spacing} labelledby={title ? id : undefined}>
	<div class="grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-16">
		<div>
			{#if title}<h2 {id} class="text-2xl sm:text-3xl" data-field="title">{title}</h2>{/if}
			{#if intro}
				<p class="mt-3 text-base leading-relaxed {mutedClass(surface)}" data-field="intro">{intro}</p>
			{/if}
		</div>

		<div>
			<ol class="flex flex-col gap-3">
				{#each items as item, index (index)}
					<li
						class="flex items-center gap-4 px-5 py-4 {surface === 'ink'
							? 'rounded-block border border-white/12 bg-white/[0.04]'
							: 'block-card'}"
					>
						<span
							class="font-display inline-flex size-9 shrink-0 items-center justify-center rounded-full text-base leading-none {surface === 'ink'
								? 'bg-coral/20 text-coral'
								: 'bg-coral-wash text-coral-ink'}"
						>
							{index + 1}
						</span>
						<p
							class="min-w-0 text-base leading-snug font-semibold sm:text-lg"
							data-field="items.{index}.text"
						>{read.itemText(item, 'text')}</p>
					</li>
				{/each}
			</ol>

			<Buttons items={read.list('buttons')} {surface} />
		</div>
	</div>
</Section>
