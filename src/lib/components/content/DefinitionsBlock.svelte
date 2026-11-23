<script lang="ts">
	import { SPACING_KEYS, SURFACE_KEYS } from '$lib/shared/content/blocks/common';
	import Buttons from './Buttons.svelte';
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

	const surface = $derived(read.choice('surface', SURFACE_KEYS, 'cream'));
	const spacing = $derived(read.choice('spacing', SPACING_KEYS, 'normal'));
	const layout = $derived(
		read.choice('layout', ['etroite', 'large', 'empilee'] as const, 'etroite')
	);

	const title = $derived(read.text('title'));
	const intro = $derived(read.text('intro'));
	const items = $derived(read.list('items'));

	/**
	 * La largeur de la colonne des intitules.
	 *
	 * Deux largeurs et un empilement, pas un curseur : un intitule de trois mots
	 * et un intitule de huit ne demandent pas la meme colonne, mais au-dela de
	 * ces trois cas on ne regle plus une mise en page, on la bricole.
	 */
	const ROWS: Record<string, string> = {
		etroite: 'sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-10',
		large: 'lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-10',
		empilee: ''
	};
</script>

<Section {surface} {spacing} shapes={read.raw('shapes') === 'oui'} labelledby={title ? id : undefined}>
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
		<p class="measure mt-4 text-base leading-relaxed {mutedClass(surface)}" data-field="intro">{intro}</p>
	{/if}

	<!--
		Un `dl` et non une grille de cartes : un intitule et son explication
		forment un couple, et le balisage doit le dire. Les filets separent, les
		cartes decoupent — ici il s'agit d'une meme liste, pas d'objets distincts.
	-->
	<dl class="mt-10 flex flex-col gap-3">
		{#each items as item, index (index)}
			{@const consequence = read.itemText(item, 'consequence')}
			<div
				class="grid gap-2 px-6 py-6 {ROWS[layout]} {surface === 'ink'
					? 'rounded-block border border-white/12 bg-white/[0.04]'
					: 'block-card'}"
			>
				<dt class="text-xl font-semibold" data-field="items.{index}.term">
					{read.itemText(item, 'term')}
				</dt>
				<dd class="measure leading-relaxed {mutedClass(surface)}">
					<span class="block" data-field="items.{index}.body">{read.itemText(item, 'body')}</span>

					{#if consequence}
						<!-- Le filet corail ne decore pas : il isole ce que la regle coute,
						     pour qu'on ne lise pas l'avantage sans la contrepartie. -->
						<span
							class="border-coral measure mt-4 block border-l-4 pl-4 leading-relaxed"
							data-field="items.{index}.consequence"
						>{consequence}</span>
					{/if}
				</dd>
			</div>
		{/each}
	</dl>

	<Buttons items={read.list('buttons')} {surface} class="mt-12" />
</Section>
