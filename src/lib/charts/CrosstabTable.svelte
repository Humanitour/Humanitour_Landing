<script lang="ts">
	import type { CrosstabResult } from '$lib/server/survey/aggregate';
	import { formatCount } from '$lib/shared/format';
	import { maxCellValue, readCell, type CellBasis } from './crosstab-cell';
	import { rankedColumns } from './echarts/options';
	import { sequentialStep } from './palette';

	interface Props {
		data: CrosstabResult;
		xLabel: string;
		yLabel: string;
		/** Lecture des cases : en ligne, en colonne, sur le total, ou en effectifs. */
		basis: CellBasis;
		/** Le meme croisement en brut, quand `data` est redresse : chaque case montre les deux. */
		raw?: CrosstabResult | null;
	}

	let { data, xLabel, yLabel, basis, raw = null }: Props = $props();

	const columns = $derived(rankedColumns(data));

	/**
	 * Echelle de l intensite, calculee sur les seules cases publiees.
	 *
	 * La couleur SITUE la valeur, le chiffre la dit : chaque case porte les deux,
	 * donc un lecteur qui ne distingue pas les teintes ne perd rien.
	 */
	const max = $derived(maxCellValue(data, basis));

	function intensity(value: number | null): string {
		if (value === null || max <= 0) return 'transparent';
		return sequentialStep(value / max);
	}

	const READINGS: Readonly<Record<CellBasis, string>> = {
		ligne: 'Chaque case indique la part en ligne et son effectif.',
		colonne: 'Chaque case indique la part au sein de la colonne.',
		total: "Chaque case indique la part de l'échantillon entier.",
		effectif: 'Chaque case indique un effectif brut.'
	};
</script>

<!--
	Le tableau deborde horizontalement sur mobile plutot que de comprimer les
	colonnes jusqu'a l'illisible.

	La regle svelte que l'on desactive vise les elements rendus focalisables sans
	raison. Ici la raison est WCAG 2.1.1 : une zone qui defile et qu'on ne peut pas
	atteindre au clavier cache ses colonnes de droite a qui n'a pas de souris. Le
	couple role="region" + tabindex="0" est la technique recommandee pour ce cas.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="overflow-x-auto"
	tabindex="0"
	role="region"
	aria-label="Tableau croisé, défilement horizontal"
>
	<table class="w-full min-w-[36rem] border-collapse text-sm">
		<caption class="text-muted pb-3 text-left text-sm">
			{xLabel} croisé avec {yLabel}. {READINGS[basis]}
		</caption>
		<thead>
			<tr class="border-ink border-b">
				<th scope="col" class="py-2 pr-4 text-left font-semibold">{xLabel}</th>
				{#each columns as modality (modality.key)}
					<th scope="col" class="px-3 py-2 text-right font-semibold whitespace-nowrap">
						{modality.label}
					</th>
				{/each}
				<th scope="col" class="py-2 pl-3 text-right font-semibold">Total</th>
			</tr>
		</thead>
		<tbody>
			{#each data.xModalities as xModality (xModality.key)}
				<tr class="border-ink border-b last:border-0">
					<th scope="row" class="py-2.5 pr-4 text-left font-medium">{xModality.label}</th>
					{#each columns as yModality (yModality.key)}
						{@const reading = readCell(data, xModality.key, yModality.key, basis)}
						<td
							class="tabular px-3 py-2.5 text-right"
							style:background-color={intensity(reading.value)}
						>
							{#if reading.suppressed}
								<span class="text-muted" title="Effectif insuffisant pour publier ce croisement">
									{reading.text}
								</span>
							{:else}
								<span class="font-semibold">{reading.text}</span>
								{#if raw}
									<span class="text-muted block text-xs">
										brut {readCell(raw, xModality.key, yModality.key, basis).text}
									</span>
								{/if}
							{/if}
						</td>
					{/each}
					<td class="tabular text-muted py-2.5 pl-3 text-right">
						{formatCount(data.rowTotals.get(xModality.key) ?? null)}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
