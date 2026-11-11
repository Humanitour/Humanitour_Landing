<script lang="ts">
	import { enhance } from '$app/forms';
	import Flash from '$components/admin/Flash.svelte';
	import PageHeader from '$components/admin/PageHeader.svelte';
	import Panel from '$components/admin/Panel.svelte';
	import { formatDate } from '$lib/shared/format';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Réglages, back-office</title></svelte:head>

<PageHeader title="Réglages" description="Ce qui s'applique à l'ensemble de la plateforme." />

<Flash message={form?.message} />

<div class="max-w-2xl">
	<Panel
		title="Seuil d'anonymat"
		description="Tout agrégat portant sur moins de répondants que ce seuil est masqué, sur le site comme dans l'API."
	>
		<form method="POST" use:enhance class="flex flex-col gap-4">
			<label class="flex flex-col gap-1.5">
				<span class="text-sm font-semibold">Nombre minimal de répondants</span>
				<span class="text-muted text-xs">
					Défaut : {data.defaultThreshold}, la norme de diffusion des données locales. Le baisser
					augmente le risque qu'un croisement fin permette de reconnaître quelqu'un.
				</span>
				<input
					type="number"
					name="threshold"
					min="1"
					required
					value={data.threshold}
					class="border-ink/20 bg-paper w-32 rounded-field border px-3 py-2 min-h-11"
				/>
			</label>

			<p class="border-coral/40 bg-coral-wash rounded-field border px-4 py-3 text-sm">
				Le masquage s'applique dans la couche d'agrégation, pas à l'affichage : un chiffre masqué
				ne peut donc pas fuiter par un export ou par l'API. Une seconde passe masque une case
				supplémentaire quand la première se retrouverait par soustraction.
			</p>

			<div>
				<button
					type="submit"
					class="bg-ink text-paper press rounded-pill px-5 py-2.5 text-sm font-semibold min-h-11 inline-flex items-center justify-center"
				>
					Enregistrer
				</button>
			</div>

			{#if data.updatedAt}
				<p class="text-muted text-xs">
					Dernière modification le {formatDate(data.updatedAt)}
					{#if data.updatedBy}par {data.updatedBy}{/if}.
				</p>
			{/if}
		</form>
	</Panel>
</div>
