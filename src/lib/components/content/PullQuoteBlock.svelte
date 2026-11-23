<script lang="ts">
	import RichText from '$components/RichText.svelte';
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

	const surface = $derived(read.choice('surface', SURFACE_KEYS, 'cream'));
	const spacing = $derived(read.choice('spacing', SPACING_KEYS, 'ample'));

	const title = $derived(read.text('title'));
	const subtitle = $derived(read.text('subtitle'));
	const sourceUrl = $derived(read.raw('sourceUrl'));
	const items = $derived(read.list('items'));
</script>

<!--
	Composition asymetrique : l'attribution tient dans une colonne etroite a
	gauche, la citation et ce qu'elle entraine occupent la largeur utile.
-->
<Section {surface} {spacing} labelledby={title ? id : undefined}>
	<div class="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-16">
		<div>
			{#if title}<h2 {id} class="text-2xl sm:text-3xl" data-field="title">{title}</h2>{/if}
			{#if subtitle}
				<p class="mt-3 text-base {mutedClass(surface)}" data-field="subtitle">{subtitle}</p>
			{/if}
		</div>

		<div>
			<div
				class="p-6 sm:p-8 {surface === 'ink'
					? 'rounded-block border border-white/12 bg-white/[0.04] shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]'
					: 'block-card'}"
			>
				<blockquote class="measure border-coral border-l-4 pl-5 text-2xl leading-snug font-medium sm:text-3xl">
					<!-- Les guillemets sont du gabarit, pas du champ : la zone modifiable ne
					     porte que la citation, sinon on les effacerait en tapant. -->
					« <span data-field="quote">{read.text('quote')}</span> »
				</blockquote>

				<!-- Une citation sans source ne se publie pas : l'auteur est obligatoire
				     a la saisie, il ne peut donc pas manquer ici. -->
				<p class="mt-4 pl-6 text-base {mutedClass(surface)}">
					<span data-field="author">{read.text('author')}</span>
					{#if sourceUrl}
						—
						<a href={sourceUrl} class="underline decoration-2 underline-offset-2">la source</a>
					{/if}
				</p>
			</div>

			<div class="mt-10 text-lg" data-field="body" data-field-kind="doc">
				<RichText doc={read.doc('body')} {surface} />
			</div>

			{#if items.length > 0}
				<dl class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
					{#each items as item, index (index)}
						<div
							class="measure p-5 sm:p-6 {surface === 'ink'
								? 'rounded-block border border-white/12 bg-white/[0.04]'
								: 'block-card'}"
						>
							<dt class="text-lg font-semibold sm:text-xl" data-field="items.{index}.term">
								{read.itemText(item, 'term')}
							</dt>
							<dd
								class="mt-2 leading-relaxed {mutedClass(surface)}"
								data-field="items.{index}.body"
							>{read.itemText(item, 'body')}</dd>
						</div>
					{/each}
				</dl>
			{/if}
		</div>
	</div>
</Section>
