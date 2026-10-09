<script lang="ts">
	import ContentBlocks from '$components/ContentBlocks.svelte';
	import { SITE } from '$lib/shared/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{SITE.name}, {SITE.tagline}</title>
	<meta name="description" content={SITE.description} />
	<meta property="og:title" content="{SITE.name}, {SITE.tagline}" />
	<meta property="og:description" content={SITE.description} />
	<meta property="og:image" content="/logo-badge.png" />
	<meta property="og:type" content="website" />
</svelte:head>

<!--
	L'accueil est compose au back-office, section par section.

	Sa composition d'origine — couverture photographique, tele contre terrain,
	questions posees, methode, sondage-reportage, constat, cout, equipe,
	engagements, cloture —
	vit dans `shared/content/templates/home.ts` et se reapplique en un geste. La
	page, elle, ne fait plus que servir ce que la base contient.
-->
<ContentBlocks
	blocks={data.blocks}
	tokens={data.tokens}
	team={data.team}
	selection={data.selection}
/>
