<script lang="ts">
	import type { DistributionResult } from '$lib/server/survey/aggregate';
	import { formatCount, formatShare, SUPPRESSED_LABEL } from '$shared/format';

	/**
	 * Le tableau des chiffres qui accompagne un graphique de repartition.
	 *
	 * Ce n est pas un doublon du graphique : c est la compensation exigee par la
	 * palette (`charts/palette.ts`), dont trois teintes passent sous 3:1 contre
	 * le papier. La regle qui en decoule est que la couleur ne porte JAMAIS
	 * seule l information. Un lecteur daltonien, un ecran mal calibre, une
	 * impression en noir et blanc : dans les trois cas, le tableau reste juste.
	 *
	 * Il porte aussi le rang, parce que c est ce qu on vient y chercher.
	 */
	interface Props {
		data: DistributionResult;
		/** Libelle exact de la question, qui sert de titre au tableau. */
		question: string;
		/** Le meme resultat en brut, quand `data` est redresse : les deux colonnes s affichent. */
		raw?: DistributionResult | null;
	}

	let { data, question, raw = null }: Props = $props();

	const rawByKey = $derived(new Map((raw?.bars ?? []).map((bar) => [bar.key, bar])));
</script>

<table class="w-full border-collapse text-sm">
	<caption class="text-muted pb-3 text-left">{question}</caption>
	<thead>
		<tr class="border-ink/20 border-b">
			<th scope="col" class="py-2 pr-3 text-left font-semibold">Rang</th>
			<th scope="col" class="py-2 pr-3 text-left font-semibold">Modalité</th>
			<th scope="col" class="py-2 pr-3 text-right font-semibold">Effectif</th>
			<th scope="col" class="py-2 text-right font-semibold">{raw ? 'Part redressée' : 'Part'}</th>
			{#if raw}
				<th scope="col" class="py-2 pl-3 text-right font-semibold">Part brute</th>
			{/if}
		</tr>
	</thead>
	<tbody>
		{#each data.bars as bar, index (bar.key)}
			<tr class="border-ink/12 border-b last:border-0">
				<td class="tabular text-muted py-2 pr-3">
					<!-- La non-reponse n est pas classee : elle est comptee comme les
					     autres, mais elle ne concourt pas. -->
					{bar.isNonResponse ? '' : index + 1}
				</td>
				<td class="py-2 pr-3 {bar.isNonResponse ? 'text-muted italic' : ''}">{bar.label}</td>
				<td class="tabular py-2 pr-3 text-right">
					{bar.suppressed ? SUPPRESSED_LABEL : formatCount(bar.count)}
				</td>
				<td class="tabular py-2 text-right font-semibold">
					{bar.suppressed ? '' : formatShare(bar.share)}
				</td>
				{#if raw}
					{@const rawBar = rawByKey.get(bar.key)}
					<td class="tabular text-muted py-2 pl-3 text-right">
						{rawBar && !rawBar.suppressed ? formatShare(rawBar.share) : ''}
					</td>
				{/if}
			</tr>
		{/each}
	</tbody>
</table>
