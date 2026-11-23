<script lang="ts">
	import Button from '$components/Button.svelte';
	import { reveal } from '$lib/actions/reveal';
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
	const spacing = $derived(read.choice('spacing', SPACING_KEYS, 'ample'));
	const layout = $derived(read.choice('layout', ['ligne', 'grille'] as const, 'ligne'));

	const title = $derived(read.text('title'));
	const intro = $derived(read.text('intro'));
	const moreHref = $derived(read.raw('moreHref'));

	/**
	 * Les fiches affichees.
	 *
	 * Deux sources, dans cet ordre : la liste saisie dans la section si elle
	 * existe, sinon l'equipe ecrite dans le code (`shared/site.ts`), dont l'ordre
	 * vient du serveur — tire au sort a chaque chargement, voir `context.ts`. Le
	 * tirer ici donnerait un ordre au rendu serveur et un autre a l'hydratation.
	 *
	 * Le repli n'est pas une commodite : c'est ce qui permet a l'accueil et a
	 * « A propos » de montrer la meme equipe sans la saisir deux fois. Des qu'une
	 * section porte sa propre liste, elle est seule maitre de ce qu'elle affiche.
	 */
	interface Card {
		readonly key: string;
		readonly name: string;
		readonly role: string;
		readonly bio: string;
		readonly website: string | null;
		readonly src: string;
		readonly width: number;
		readonly height: number;
	}

	/** Le portrait par defaut, pose par le depot sous le `slug` de la personne. */
	const PORTRAIT_SIZE = 420;

	const saved = $derived(read.list('members'));

	const cards: Card[] = $derived(
		saved.length > 0
			? saved.map((member, index) => {
					const portrait = read.itemImage(member, 'portrait');
					return {
						key: String(index),
						name: read.itemText(member, 'name') ?? '',
						role: read.itemText(member, 'role') ?? '',
						bio: read.itemText(member, 'bio') ?? '',
						website: read.itemText(member, 'website'),
						src: portrait?.src ?? '',
						width: portrait?.width ?? PORTRAIT_SIZE,
						height: portrait?.height ?? PORTRAIT_SIZE
					};
				})
			: (page.team ?? []).map((member) => ({
					key: member.slug,
					name: member.name,
					role: member.role,
					bio: member.bio,
					website: member.website ?? null,
					src: `/equipe/${member.slug}.jpg`,
					width: PORTRAIT_SIZE,
					height: PORTRAIT_SIZE
				}))
	);

	/** Vrai quand la liste vient de la section : elle est alors modifiable. */
	const editableList = $derived(saved.length > 0);

	/* Le corail sombre ne passe pas sur l'aplat noir (3,3:1). */
	const roleClass = $derived(surface === 'ink' ? 'text-coral' : 'text-coral-ink');
	const roleMutedClass = $derived(surface === 'ink' ? 'text-paper/70' : 'text-muted');

	/* Sur l'accueil (`ligne` + lien « Découvrir l'équipe »), on limite a 5 pour tenir sur une seule ligne bien alignee. */
	const previewCards = $derived(moreHref ? cards.slice(0, 5) : cards);
</script>

<!--
	Les portraits viennent de la plaquette (`static/equipe/`). Le `alt` est vide
	parce que le nom est ecrit juste en dessous : le repeter ferait entendre deux
	fois la meme chose a un lecteur d'ecran.

	Les fiches sont identiques a dessein : ce sont des pairs, et donner plus de
	place a l'une laisserait entendre une hierarchie qui n'existe pas.
-->
<Section
	{surface}
	{spacing}
	labelledby={title ? id : undefined}
	label={title ? undefined : 'L’équipe'}
>
	{#if layout === 'grille'}
		{#if title}<h2 {id} class="text-2xl sm:text-3xl" data-field="title">{title}</h2>{/if}
		{#if intro}
			<p class="measure mt-4 text-base leading-relaxed {mutedClass(surface)}" data-field="intro">
				{intro}
			</p>
		{/if}

		<ul class="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4" class:mt-12={title || intro}>
			{#each cards as member, index (member.key)}
				<!-- MOTION : les portraits entrent l'un apres l'autre, une seule fois. -->
				<li use:reveal={index * 100}>
					{#if member.src}
						<img
							src={member.src}
							alt=""
							width={member.width}
							height={member.height}
							loading="lazy"
							class="aspect-square w-28 rounded-full object-cover sm:w-32"
						/>
					{/if}
					<h3
						class="mt-5 text-xl font-semibold"
						data-field={editableList ? `members.${index}.name` : undefined}
					>
						{member.name}
					</h3>
					<p
						class="mt-0.5 text-sm font-medium {roleClass}"
						data-field={editableList ? `members.${index}.role` : undefined}
					>
						{member.role}
					</p>
					<p
						class="mt-3 leading-relaxed {mutedClass(surface)}"
						data-field={editableList ? `members.${index}.bio` : undefined}
					>
						{member.bio}
					</p>

					{#if member.website}
						<!-- Le libelle du lien est le domaine, pas « Site personnel » : c'est
						     ce qu'on lit dans la barre d'adresse apres avoir clique. -->
						{@const domain = member.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
						<p class="mt-3 text-sm {mutedClass(surface)}">
							Site personnel&nbsp;:
							<a
								href={member.website}
								target="_blank"
								rel="noopener noreferrer"
								class="font-semibold underline decoration-2 underline-offset-2 {roleClass}"
							>
								{domain}
							</a>
						</p>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<div class="grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-center lg:gap-12">
			<div>
				{#if title}<h2 {id} class="text-2xl sm:text-3xl" data-field="title">{title}</h2>{/if}
				{#if intro}
					<p class="mt-3 text-base leading-relaxed {mutedClass(surface)}" data-field="intro">
						{intro}
					</p>
				{/if}
				{#if moreHref}
					<div class="mt-6">
						<Button href={moreHref} variant={surface === 'ink' ? 'inverse' : 'outline'}>
							Découvrir l'équipe
						</Button>
					</div>
				{/if}
			</div>

			<ul class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
				{#each previewCards as member, index (member.key)}
					<li use:reveal={index * 70} class="flex flex-col">
						{#if member.src}
							<img
								src={member.src}
								alt=""
								width={member.width}
								height={member.height}
								loading="lazy"
								decoding="async"
								class="rounded-panel aspect-square w-full object-cover"
							/>
						{/if}
						<p
							class="mt-2.5 truncate text-sm leading-tight font-semibold"
							data-field={editableList ? `members.${index}.name` : undefined}
						>
							{member.name}
						</p>
						<p
							class="mt-1 truncate border-t pt-1 text-xs {surface === 'ink'
								? 'border-white/15'
								: 'border-ink/12'} {roleMutedClass}"
							data-field={editableList ? `members.${index}.role` : undefined}
						>
							{member.role}
						</p>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</Section>
