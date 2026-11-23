<script lang="ts">
	import MeshShader from '$components/MeshShader.svelte';
	import { SPACING_KEYS, SURFACE_KEYS } from '$lib/shared/content/blocks/common';
	import Buttons from './Buttons.svelte';
	import { getContentContext } from './context';
	import Marked from './Marked.svelte';
	import { sectionReader } from './read';
	import Section from './Section.svelte';
	import { CONTAINER, mutedClass, SURFACE_CLASS } from './surfaces';

	interface Props {
		id: string;
		data: Readonly<Record<string, unknown>>;
	}

	let { id, data }: Props = $props();

	const page = getContentContext();
	const read = $derived(sectionReader(data, page.tokens));

	const surface = $derived(read.choice('surface', SURFACE_KEYS, 'cream'));
	const spacing = $derived(read.choice('spacing', SPACING_KEYS, 'normal'));
	const decor = $derived(read.choice('decor', ['aucun', 'aplats', 'mouvement'] as const, 'aucun'));
	const fullHeight = $derived(read.choice('fullHeight', ['contenu', 'ecran'] as const, 'contenu'));

	const title = $derived(read.text('title') ?? '');
	const intro = $derived(read.text('intro'));
	const image = $derived(read.image('image'));
	const accent = $derived(read.text('accent'));
	const figures = $derived(read.list('figures'));
	const buttons = $derived(read.list('buttons'));

	/**
	 * La composition photographique n'est possible qu'avec une photographie.
	 *
	 * Sans elle, « tient dans l'ecran » donnerait un aplat vide d'une hauteur
	 * d'ecran : le reglage se replie de lui-meme plutot que de produire une page
	 * cassee que personne n'aurait demandee.
	 */
	const isHero = $derived(fullHeight === 'ecran' && image !== null);
</script>

{#snippet body()}
	<!--
		MOTION : entree unique au chargement, echelonnee dans l'ordre de lecture.
		Elle se joue une fois, ne boucle pas, ne se rejoue pas au defilement, et
		`prefers-reduced-motion` la supprime entierement.
	-->
	<h1 id={id} class="enter {isHero ? 'hero-title' : 'max-w-3xl'}" data-field="title">
		<Marked
			text={title}
			highlight={read.text('highlight')}
			style={read.raw('highlightStyle') ?? 'brand'}
		/>
	</h1>

	{#if intro}
		<!--
			Deux corps : dans la couverture qui tient dans un ecran, l'accroche
			partage la hauteur avec les chiffres et les boutons et reste au corps
			courant ; ailleurs, elle est le second element de la page et porte le
			propos a elle seule.
		-->
		<p
			class="measure enter leading-relaxed {isHero
				? 'mt-5 sm:text-lg'
				: 'mt-7 text-xl font-medium sm:text-2xl'}"
			style="--enter-delay: 90ms"
			data-field="intro"
		>{intro}</p>
	{/if}

	{#if figures.length > 0}
		<dl
			class="enter mt-5 grid grid-cols-2 gap-3 sm:mt-7 sm:gap-3.5"
			style="--enter-delay: 180ms"
		>
			{#each figures as figure, index (index)}
				<!--
					`flex-col-reverse` : le chiffre se lit en premier a l'ecran, mais
					l'ordre du DOM garde le couple terme/definition dans le sens que `dl`
					impose aux lecteurs d'ecran.
				-->
				<div
					class="flex flex-col-reverse gap-1.5 px-4 py-3 {surface === 'ink'
						? 'rounded-panel border border-white/12 bg-white/[0.05] shadow-[inset_0_1px_0_rgb(255_255_255/0.1)]'
						: 'block-card'}"
				>
					<dt
						class="text-xs leading-snug opacity-75 sm:text-sm"
						data-field="figures.{index}.label"
					>{read.itemText(figure, 'label')}</dt>
					<!-- `nowrap` : Bowlby One est large, « 4 000 km » se cassait en deux
					     lignes dans une demi-colonne. -->
					<dd
						class="font-display text-lg leading-none whitespace-nowrap sm:text-2xl"
						data-field="figures.{index}.value"
					>{read.itemText(figure, 'value')}</dd>
				</div>
			{/each}
		</dl>
	{/if}

	<Buttons items={buttons} {surface} class="enter mt-6 sm:mt-8" delay="270ms" />
{/snippet}

{#if isHero && image}
	<!--
		Couverture photographique.

		Deux compositions, et l'ecart entre elles est une contrainte de
		lisibilite, pas un gout : superposer le texte a la photo sur un telephone
		demanderait un voile si dense que la photo disparaitrait. Sur mobile la
		photo est donc une bande en tete, sur grand ecran elle passe a droite
		derriere un degrade noir.
	-->
	<section class="hero relative isolate overflow-hidden {SURFACE_CLASS[surface]}" aria-labelledby={id}>
		<div class="hero-media">
			<img
				src={image.src}
				alt={image.alt}
				width={image.width}
				height={image.height}
				fetchpriority="high"
				decoding="async"
				class="hero-photo"
			/>
			<div class="hero-scrim" aria-hidden="true"></div>

			{#if accent}
				<!--
					L'accent manuscrit de la charte, une seule fois par page. Il est pose
					sur la photo et non a cote : il commente la scene, il ne legende pas
					le texte. Le bas du cadre est la seule zone ou du blanc tient, et le
					voile y monte a 0,88 pour le garantir.
				-->
				<p class="font-hand hero-accent enter" style="--enter-delay: 420ms">
					{#each accent.split('\n') as line, index (index)}
						{#if index > 0}<br />{/if}{line}
					{/each}
				</p>
			{/if}
		</div>

		<!--
			`w-full` : la section est un conteneur flex pour tenir dans un ecran, et
			dans un flex, une marge automatique sur l'axe transversal ANNULE
			l'etirement. Sans lui, le bloc se reduit a son contenu et le titre ne
			s'aligne plus sur le logo de l'en-tete.
		-->
		<div class="hero-body {CONTAINER} w-full pt-5 pb-6 sm:pb-10 lg:py-12">
			<div class="lg:max-w-xl">
				{@render body()}
			</div>
		</div>
	</section>
{:else}
	<Section {surface} {spacing} shapes={decor === 'aplats'} labelledby={id}>
		{#snippet backdrop()}
			{#if decor === 'mouvement'}
				<!-- Le fond CSS statique est deja pose par la surface ; le canvas ne
				     fait que le recouvrir quand l'animation est possible. -->
				<MeshShader />
			{/if}
		{/snippet}

		{@render body()}

		{#if image}
			<div class="photo-block mt-10">
				<img
					src={image.src}
					alt={image.alt}
					width={image.width}
					height={image.height}
					loading="lazy"
					decoding="async"
					class="h-auto w-full"
				/>
			</div>
		{/if}

		{#if accent}
			<p class="font-hand mt-8 -rotate-2 text-3xl leading-tight {mutedClass(surface)}">
				{accent}
			</p>
		{/if}
	</Section>
{/if}

<style>
	/*
	 * LA COUVERTURE QUI TIENT DANS UN ECRAN
	 *
	 * `min-height` et non `height` : si le texte ne rentre pas (tres petit
	 * ecran, corps agrandi par le lecteur), la section grandit au lieu de
	 * rogner. Une couverture qui deborde de quelques pixels vaut mieux qu'un
	 * titre coupe.
	 *
	 * `svh` et non `vh` : sur mobile, `vh` se cale sur la fenetre barre d'URL
	 * retractee, donc `100vh` deborde toujours au chargement.
	 */
	.hero {
		display: flex;
		min-height: calc(100svh - var(--header-h));
		flex-direction: column;
	}

	/*
	 * La bande photographique prend ce que le texte laisse. C'est elle qui
	 * absorbe la difference entre un telephone court et un telephone long,
	 * plutot qu'une hauteur fixe qui deborderait sur l'un et laisserait un vide
	 * sur l'autre.
	 */
	.hero-media {
		position: relative;
		min-height: 42svh;
		flex: 1 1 0;
		overflow: hidden;
	}

	/*
	 * `position: absolute` : en flux, l'image imposait sa hauteur intrinseque
	 * comme base flexible, et la bande occupait 520 px au lieu de la place
	 * restante. Sortie du flux, elle ne pese plus rien dans le calcul.
	 */
	.hero-photo {
		position: absolute;
		inset: 0;
		height: 100%;
		width: 100%;
		object-fit: cover;
		/* Le sujet est dans le tiers haut du cadre d'origine : le recadrage suit
		   la tete et le velo, pas le centre geometrique. */
		object-position: 50% 30%;
	}

	/*
	 * Le voile. Il raccorde la photo a l'aplat de la section sans couture
	 * visible, et garantit le contraste du texte.
	 *
	 * Les arrets sont en LONGUEURS, pas en pourcentages : la bande est
	 * elastique, et en pourcentage l'accent manuscrit se retrouvait sur un voile
	 * de 0,53 sur un ecran court, soit 2,2:1, sous le seuil. En rem, le pied du
	 * cadre garde toujours ses 5 rem d'aplat quasi opaque.
	 */
	.hero-scrim {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			to top,
			rgb(0 0 0 / 1) 0,
			rgb(0 0 0 / 0.92) 5rem,
			rgb(0 0 0 / 0.45) 9rem,
			rgb(0 0 0 / 0.14) 14rem,
			rgb(0 0 0 / 0.1) 100%
		);
	}

	/*
	 * L'accent manuscrit, pose dans le bas du cadre photographique.
	 *
	 * C'est la seule zone ou du blanc tient sur l'image : le voile y vaut 0,88
	 * au minimum, ce qui donne plus de 6:1. Caveat est ici a 28px minimum, donc
	 * du gros corps au sens WCAG, ou le seuil n'est que de 3:1.
	 */
	.hero-accent {
		position: absolute;
		right: 1rem;
		bottom: 0.75rem;
		left: 1rem;
		rotate: -3deg;
		color: var(--color-paper);
		text-align: right;
		font-size: 1.75rem;
		line-height: 1.15;
	}

	/*
	 * Bowlby One est tres large et ne coupe pas les mots. Le `clamp` global de
	 * `h1` plafonne a 5rem, ce qui, dans la colonne de 36rem de la couverture,
	 * ferait tenir dix signes par ligne. Le plafond descend donc a 3,25rem ici.
	 */
	.hero-title {
		font-size: clamp(1.875rem, 5.4vw, 3.25rem);
		/*
		 * 0,95 est l'interlignage global de `h1`. Il est desserre ici parce que le
		 * titre porte une etiquette de marque : son rembourrage vertical mordrait
		 * sur la ligne au-dessus si les lignes restaient aussi serrees.
		 */
		line-height: 1.06;
	}

	@media (min-width: 64rem) {
		/*
		 * Grand ecran : la photo passe a droite, plein cadre en hauteur, et le
		 * texte reprend la colonne de gauche sur l'aplat.
		 *
		 * 46 % et non 52 % : `object-fit: cover` agrandit l'image jusqu'a remplir
		 * la boite dans les DEUX sens, donc plus la boite est large, plus le
		 * cadrage se resserre. A 46 %, la photo est affichee a 86 % de sa
		 * definition et n'en perd que 6 % en hauteur.
		 */
		.hero-media {
			position: absolute;
			inset: 0 0 0 auto;
			width: 46%;
			min-height: 0;
			flex: none;
		}

		.hero-photo {
			object-position: 50% 28%;
		}

		/*
		 * Les pourcentages sont ceux de la boite photo, qui commence a 48 % de la
		 * largeur de la page. La colonne de texte s'arrete au plus loin vers 21 %
		 * de cette boite : le voile y vaut encore 0,97, ce qui donne au texte
		 * blanc plus de 18:1.
		 */
		.hero-scrim {
			background:
				linear-gradient(
						to top,
						rgb(0 0 0 / 0.92) 0,
						rgb(0 0 0 / 0.9) 8rem,
						rgb(0 0 0 / 0.3) 13rem,
						rgb(0 0 0 / 0) 18rem
					),
				linear-gradient(
					to right,
					rgb(0 0 0 / 1) 0%,
					rgb(0 0 0 / 1) 18%,
					rgb(0 0 0 / 0.88) 34%,
					rgb(0 0 0 / 0.45) 56%,
					rgb(0 0 0 / 0.22) 80%,
					rgb(0 0 0 / 0.18) 100%
				);
		}

		.hero-accent {
			right: 2.5rem;
			bottom: 2rem;
			left: auto;
			max-width: 22rem;
			font-size: 2.25rem;
		}

		.hero-body {
			position: relative;
			display: flex;
			min-height: calc(100svh - var(--header-h));
			flex-direction: column;
			justify-content: center;
		}
	}
</style>
