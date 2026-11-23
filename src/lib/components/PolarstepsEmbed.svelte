<script lang="ts">
	import Button from '$components/Button.svelte';
	import { LINKS, TOUR } from '$lib/shared/site';
</script>

<!--
	Polarsteps bloque l'integration en iframe via `Content-Security-Policy: frame-ancestors 'none'`.
	Au lieu d'afficher un cadre vide bloque par le navigateur, on presente une
	carte directe vers le carnet de route public (sans cookie tiers).
-->
<div class="block-card flex flex-col justify-between gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
	<div class="measure">
		<p class="text-coral-ink text-xs font-semibold tracking-wide uppercase">
			Carnet de route · {TOUR.regions} régions
		</p>
		<p class="mt-2 text-lg font-semibold leading-snug">
			Le tour de France étape par étape sur Polarsteps
		</p>
		<p class="text-ink-soft mt-2 text-sm leading-relaxed">
			{LINKS.polarsteps.description} Polarsteps ne permet pas l'affichage intégré dans une autre
			page : le carnet s'ouvre directement sur leur site.
		</p>
	</div>

	<div class="shrink-0">
		<Button href={LINKS.polarsteps.href} external variant="outline">
			Ouvrir le carnet sur Polarsteps
		</Button>
	</div>
</div>
