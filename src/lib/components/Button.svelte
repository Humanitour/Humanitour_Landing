<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type Variant = 'primary' | 'brand' | 'outline' | 'inverse' | 'ghost';
	type Size = 'md' | 'lg';

	interface Props {
		variant?: Variant;
		size?: Size;
		href?: string;
		/** Ouvre dans un nouvel onglet et pose rel="noopener". */
		external?: boolean;
		children: Snippet;
	}

	let {
		variant = 'primary',
		size = 'md',
		href,
		external = false,
		children,
		...rest
	}: Props & HTMLAnchorAttributes & HTMLButtonAttributes = $props();

	/**
	 * La pilule vient du lettrage du logo, dont tous les angles sont pleins.
	 *
	 * « brand » porte du texte noir et non blanc : blanc sur le corail de la
	 * charte ne donne que 3,11:1, sous le minimum AA pour du texte courant.
	 *
	 * « inverse » est le contour des surfaces d encre : sur un aplat noir, le
	 * contour d encre d « outline » serait invisible. Il n existe que pour ca.
	 */
	const VARIANTS: Record<Variant, string> = {
		primary: 'btn-3d btn-3d-ink',
		brand: 'btn-3d btn-3d-brand',
		outline: 'btn-3d btn-3d-outline',
		inverse: 'btn-3d btn-3d-inverse',
		ghost: 'press text-ink underline decoration-2 underline-offset-4'
	};

	/* Taille de cible tactile : 44px au minimum, meme quand le libelle est court. */
	const SIZES: Record<Size, string> = {
		md: 'min-h-11 px-5 py-2.5 text-sm',
		lg: 'min-h-13 px-7 py-3.5 text-base'
	};

	const base =
		'inline-flex items-center justify-center gap-2 rounded-pill font-semibold tracking-tight disabled:cursor-not-allowed disabled:opacity-50';

	// $derived et non const : sans cela la classe figerait la valeur initiale des
	// props et un changement de variante ne se verrait jamais.
	const className = $derived(`${base} ${VARIANTS[variant]} ${SIZES[size]}`);
</script>

{#if href}
	<a
		{href}
		class={className}
		target={external ? '_blank' : undefined}
		rel={external ? 'noopener noreferrer' : undefined}
		{...rest}
	>
		{@render children()}
	</a>
{:else}
	<button class={className} {...rest}>
		{@render children()}
	</button>
{/if}
