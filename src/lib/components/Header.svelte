<script lang="ts">
	import { page } from '$app/state';
	import { LINKS, NAV, SITE } from '$lib/shared/site';

	let open = $state(false);
	let toggleEl: HTMLButtonElement | undefined = $state();
	let headerEl: HTMLElement | undefined = $state();
	let scrolled = $state(false);

	// La navigation au clavier et le lecteur d ecran ont besoin de savoir quelle
	// entree correspond a la page courante : `aria-current` le dit, la couleur
	// seule ne suffit pas.
	function isCurrent(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}

	// Echap referme et rend le focus au bouton : sans ce retour, le focus reste
	// dans un menu qui n est plus affiche.
	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !open) return;
		open = false;
		toggleEl?.focus();
	}

	// Toucher la page referme le menu. Echap est le geste du clavier, celui du
	// doigt est de taper a cote : sans lui, le menu ouvert ne se refermait qu en
	// revenant sur son bouton, tout en haut de l ecran.
	//
	// `pointerdown` et non `click` : sur iOS, un `click` ne remonte pas depuis un
	// element sans gestionnaire ni `cursor: pointer`, et taper sur un paragraphe
	// n aurait rien referme. Le test porte sur l en-tete entiere, le bouton
	// compris, donc son propre `onclick` bascule sans etre annule ici.
	function onPointerDown(event: PointerEvent) {
		if (!open) return;
		const target = event.target;
		if (target instanceof Node && headerEl?.contains(target)) return;
		open = false;
	}

	// Seuil au-dela du premier ecran : sur mobile, le rebond elastique
	// (overscroll) produit de petites valeurs de `scrollY` au repos, un seuil
	// bas ferait entrer et sortir l en-tete de son etat flottant sans que le
	// visiteur ait vraiment scrolle.
	$effect(() => {
		function onScroll() {
			scrolled = window.scrollY > 24;
		}
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	});
</script>

<svelte:window onkeydown={onKeydown} onpointerdown={onPointerDown} />

<!--
	En-tete colle. Au repos elle occupe toute la largeur, sur `--header-h`
	exactement (la couverture d accueil calcule sa hauteur dessus). Des qu on
	scrolle, la barre se detache : plus etroite, centree, coins arrondis, comme
	posee sur le contenu plutot que soudee au bord de l ecran.

	Deux couches : `header-shell` porte le collage et l espace qui se creuse
	autour de la barre (transparent, le fond de la section defilee y apparait) ;
	`header-surface` porte le fond, l ombre et la forme qui changent.
-->
<header bind:this={headerEl} class="header-shell sticky top-0 z-50" class:is-scrolled={scrolled}>
	<div class="header-surface bg-cream mx-auto">
		<div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
			<a href="/" class="flex items-center py-1" aria-label="{SITE.name}, accueil">
				<img
					src="/logo-lockup-ink.png"
					alt={SITE.name}
					width="1200"
					height="335"
					class="h-8 w-auto sm:h-9"
				/>
			</a>

			<!-- Sept rubriques plus les deux appels a l action tiennent tout juste a
			     1024 px : l espacement se resserre a `lg` et retrouve sa valeur a
			     `xl`, plutot que de renvoyer les portables au menu deroulant. -->
			<nav class="hidden items-center gap-0.5 lg:flex xl:gap-1" aria-label="Navigation principale">
				{#each NAV as item (item.href)}
					{@const current = isCurrent(item.href)}
					<!-- La page courante se signale par un aplat plein, pas par une seule
					     couleur : un daltonien doit pouvoir la reperer aussi. -->
					<a
						href={item.href}
						aria-current={current ? 'page' : undefined}
						class="rounded-pill px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition-[background-color,box-shadow,transform] duration-150 xl:px-4 {current
							? 'btn-3d btn-3d-ink'
							: 'hover:bg-paper hover:shadow-[0_0_0_1px_var(--line),0_1px_2px_rgb(0_0_0/0.06)]'}"
					>
						{item.label}
					</a>
				{/each}
			</nav>

			<div class="hidden items-center gap-4 lg:flex">
				<a
					href={LINKS.discord.href}
					target="_blank"
					rel="noopener noreferrer"
					class="rounded-pill px-3 py-2.5 text-sm font-semibold whitespace-nowrap underline decoration-2 underline-offset-4"
				>
					Discord
				</a>
				<a
					href={LINKS.helloasso.href}
					target="_blank"
					rel="noopener noreferrer"
					class="btn-3d btn-3d-brand rounded-pill px-5 py-2.5 text-sm font-semibold whitespace-nowrap"
				>
					Adhérer
				</a>
			</div>

			<!-- Le libelle « Menu » reste visible : une icone seule suppose que le
			     visiteur sait deja qu un menu se cache derriere trois traits. -->
			<button
				bind:this={toggleEl}
				type="button"
				class="btn-3d btn-3d-outline flex min-h-11 items-center gap-2 rounded-pill px-4 py-2 text-sm font-semibold lg:hidden"
				aria-expanded={open}
				aria-controls="menu-mobile"
				onclick={() => (open = !open)}
			>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					{#if open}
						<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.5" />
					{:else}
						<path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2.5" />
					{/if}
				</svg>
				{open ? 'Fermer' : 'Menu'}
			</button>
		</div>

		{#if open}
			<div id="menu-mobile" class="border-ink/10 border-t lg:hidden">
				<nav class="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3" aria-label="Navigation mobile">
					{#each NAV as item (item.href)}
						{@const current = isCurrent(item.href)}
						<a
							href={item.href}
							aria-current={current ? 'page' : undefined}
							class="rounded-pill px-4 py-3 font-semibold {current ? 'bg-ink text-paper' : ''}"
							onclick={() => (open = false)}
						>
							{item.label}
						</a>
					{/each}
					<div class="mt-2 flex flex-col gap-2">
						<a
							href={LINKS.discord.href}
							target="_blank"
							rel="noopener noreferrer"
							class="border-ink rounded-pill border-2 px-5 py-3 text-center font-semibold"
						>
							Rejoindre le Discord
						</a>
						<a
							href={LINKS.helloasso.href}
							target="_blank"
							rel="noopener noreferrer"
							class="btn-3d btn-3d-brand rounded-pill px-5 py-3 text-center font-semibold"
						>
							Adhérer à l'association
						</a>
					</div>
				</nav>
			</div>
		{/if}
	</div>
</header>

<style>
	/*
	 * `header-shell` reste transparent et pleine largeur : c est lui qui colle
	 * en haut de la fenetre. L espace qui se creuse autour de la barre au
	 * defilement laisse voir la section defilee derriere, ce qui donne l effet
	 * de flottement plutot qu un simple retrecissement.
	 */
	.header-shell {
		padding: 0;
		transition: padding 380ms var(--ease-overshoot);
	}

	.header-shell.is-scrolled {
		padding: 0.75rem 1rem;
	}

	/*
	 * `max-width` anime de « toute la largeur » (habillee par `header-shell`)
	 * a une colonne plus etroite que `max-w-6xl` : sans cet ecart, la barre
	 * flottante toucherait les memes bords que le contenu et ne lirait pas
	 * comme detachee.
	 */
	.header-surface {
		max-width: 100%;
		border: 1px solid transparent;
		box-shadow: var(--shadow-lift);
		transition:
			max-width 380ms var(--ease-overshoot),
			border-radius 380ms var(--ease-overshoot),
			background-color 240ms ease,
			border-color 240ms ease,
			box-shadow 240ms ease;
	}

	/*
	 * 76 rem, pas moins : la rangee interne (logo, liens, Discord, Adherer)
	 * est deja plafonnee a `max-w-6xl` (72 rem) plus son propre `px-6` (1,5 rem
	 * de chaque cote). En dessous de cette somme, les liens n ont pas la place
	 * de tenir sur une ligne et leur texte se met a la couper au lieu que le
	 * flex deborde.
	 */
	.header-shell.is-scrolled .header-surface {
		max-width: 76rem;
		border-radius: var(--radius-block);
		background-color: rgb(255 241 235 / 0.82);
		-webkit-backdrop-filter: blur(20px) saturate(1.5);
		backdrop-filter: blur(20px) saturate(1.5);
		border-color: var(--glass-edge);
		outline: 1px solid var(--glass-outer);
		outline-offset: 0;
		box-shadow:
			0 1px 1px rgb(0 0 0 / 0.06),
			var(--shadow-lift);
	}

	@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
		.header-shell.is-scrolled .header-surface {
			background-color: var(--color-cream);
		}
	}

	@media (prefers-reduced-transparency: reduce) {
		.header-shell.is-scrolled .header-surface {
			background-color: var(--color-cream);
			-webkit-backdrop-filter: none;
			backdrop-filter: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.header-shell,
		.header-surface {
			transition: none;
		}
	}
</style>
