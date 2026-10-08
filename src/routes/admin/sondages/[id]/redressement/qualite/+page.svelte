<script lang="ts">
	import EChart from '$components/explorer/EChart.svelte';
	import Panel from '$components/admin/Panel.svelte';
	import {
		formatCount,
		formatDecimal,
		formatPoints,
		formatShare,
		SUPPRESSED_LABEL
	} from '$lib/shared/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const base = $derived(`/admin/sondages/${data.survey.id}/redressement`);
</script>

{#if !data.quality}
	<Panel title="Tableau de bord qualité">
		<p class="text-sm">
			Aucun poids à juger : les indicateurs se calculent sur les poids écrits par un calcul.
			<a href="{base}/calcul" class="text-coral-ink underline">Lancez le calcul</a>, puis revenez ici.
		</p>
	</Panel>
{:else}
	{@const quality = data.quality}
	{@const metrics = quality.metrics}
	<div class="flex flex-col gap-6">
		<!--
			Un seul chiffre au premier plan : l effet de plan. C est lui qui dit si le
			redressement est publiable ; les autres l expliquent.
		-->
		<section class="panel grid gap-6 p-5 md:grid-cols-[minmax(0,16rem)_1fr]" aria-labelledby="kish">
			<div>
				<h2 id="kish" class="text-muted text-sm font-semibold">Effet de plan de Kish</h2>
				<p class="tabular mt-1 text-4xl font-semibold">{formatDecimal(metrics.designEffect, 2)}</p>
				<p class="mt-2 text-sm {quality.alert ? 'text-danger font-semibold' : 'text-muted'}">
					{#if quality.alert}
						Alerte : au-dessus de {formatDecimal(quality.alertThreshold, 1)}. Le redressement coûte plus
						d'un tiers de la précision ; vérifiez les bornes et les variables avant de publier.
					{:else}
						Sous le seuil d'alerte de {formatDecimal(quality.alertThreshold, 1)}.
					{/if}
				</p>
				<p class="text-muted mt-2 text-xs">Deff = 1 + CV(w)², soit n / n effectif.</p>
			</div>

			<dl class="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
				<div>
					<dt class="text-muted">Taille effective</dt>
					<dd class="tabular text-lg font-semibold">
						{formatCount(Math.round(metrics.effectiveSampleSize))}
						<span class="text-muted text-sm font-normal">/ {formatCount(metrics.respondents)}</span>
					</dd>
				</div>
				<div>
					<dt class="text-muted">Perte de précision</dt>
					<dd class="tabular text-lg font-semibold">
						{formatShare(1 - metrics.effectiveSampleSize / metrics.respondents)}
					</dd>
				</div>
				<div>
					<dt class="text-muted">CV des poids</dt>
					<dd class="tabular text-lg font-semibold">
						{formatDecimal(metrics.coefficientOfVariation, 3)}
					</dd>
				</div>
				<div>
					<dt class="text-muted">Poids extrêmes</dt>
					<dd class="tabular text-lg font-semibold">
						{formatDecimal(metrics.minWeight, 3)} à {formatDecimal(metrics.maxWeight, 3)}
					</dd>
				</div>
				<div>
					<dt class="text-muted">w max / w min</dt>
					<dd class="tabular text-lg font-semibold">{formatDecimal(metrics.weightRatio, 1)}</dd>
				</div>
				<div>
					<dt class="text-muted">Aux bornes</dt>
					<dd class="tabular text-lg font-semibold">
						{quality.settings?.trim === false ? 'sans bornes' : formatCount(metrics.atBounds)}
					</dd>
				</div>
			</dl>
		</section>

		<Panel title="Convergence">
			<p class="text-sm">
				{#if quality.convergence.converged}
					Convergé en {quality.convergence.iterations} itération{quality.convergence.iterations > 1 ? 's' : ''} :
					aucune marge ne s'écarte de sa cible de plus de {formatDecimal(
						quality.convergence.maxDeviation * 100,
						4
					)} point.
				{:else}
					<strong class="text-danger">Pas de convergence</strong> après {quality.convergence.iterations}
					itérations : une marge reste à {formatDecimal(quality.convergence.maxDeviation * 100, 3)} point de
					sa cible. Les bornes empêchent souvent d'y arriver ; le tableau des marges ci-dessous montre laquelle.
				{/if}
			</p>
			{#if quality.warnings.length > 0}
				<ul class="text-danger mt-3 flex list-disc flex-col gap-1 pl-5 text-sm">
					{#each quality.warnings as warning (`${warning.questionCode}:${warning.modalityKey}`)}
						<li>« {warning.questionCode} », modalité {warning.modalityKey} : {warning.reason}</li>
					{/each}
				</ul>
			{/if}
		</Panel>

		<Panel
			title="Distribution des poids"
			description="Nombre de répondants par classe de poids. Une masse collée à une borne dit que la troncature travaille beaucoup."
		>
			<EChart
				svg={quality.histogram.chart.svg}
				option={quality.histogram.chart.option}
				height={quality.histogram.chart.height}
				label="Histogramme des poids, de {formatDecimal(metrics.minWeight, 2)} à {formatDecimal(
					metrics.maxWeight,
					2
				)}"
			/>
			<details class="mt-3 text-sm">
				<summary class="text-coral-ink min-h-11 cursor-pointer py-2 underline"
					>Voir l'histogramme en tableau</summary
				>
				<table class="mt-2 w-full max-w-md text-sm">
					<thead class="text-muted text-left text-xs">
						<tr>
							<th scope="col" class="py-1 pr-3 font-semibold">Poids</th>
							<th scope="col" class="px-3 py-1 text-right font-semibold">Répondants</th>
							<th scope="col" class="py-1 pl-3 text-right font-semibold">Part</th>
						</tr>
					</thead>
					<tbody>
						{#each quality.histogram.rows as row (row.label)}
							<tr class="border-ink/10 border-t">
								<td class="tabular py-1 pr-3">{row.label}</td>
								<td class="tabular px-3 py-1 text-right">{formatCount(row.count)}</td>
								<td class="tabular py-1 pl-3 text-right">{formatShare(row.share)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</details>
		</Panel>

		{#each quality.margins as margin (margin.code)}
			<Panel
				title="Marges : {margin.label}"
				description="Barres bleues : échantillon brut. Barres corail : après redressement. Trait noir : cible."
			>
				<EChart
					svg={margin.chart.svg}
					option={margin.chart.option}
					height={margin.chart.height}
					label="Marges brute, redressée et cible de « {margin.label} »"
				/>
				<div class="mt-3 overflow-x-auto">
					<table class="w-full min-w-md text-sm">
						<caption class="sr-only">Marges de « {margin.label} »</caption>
						<thead class="text-muted text-left text-xs">
							<tr>
								<th scope="col" class="py-1.5 pr-3 font-semibold">Modalité</th>
								<th scope="col" class="px-3 py-1.5 text-right font-semibold">Brut</th>
								<th scope="col" class="px-3 py-1.5 text-right font-semibold">Cible</th>
								<th scope="col" class="px-3 py-1.5 text-right font-semibold">Redressé</th>
								<th scope="col" class="py-1.5 pl-3 text-right font-semibold">Écart</th>
							</tr>
						</thead>
						<tbody>
							{#each margin.rows as row (row.key)}
								{@const far =
									row.weighted !== null && row.target !== null && Math.abs(row.weighted - row.target) > 0.01}
								<tr class="border-ink/10 border-t">
									<th scope="row" class="py-1.5 pr-3 text-left font-normal">{row.label}</th>
									<td class="tabular px-3 py-1.5 text-right">{formatShare(row.observed)}</td>
									<td class="tabular px-3 py-1.5 text-right">{formatShare(row.target)}</td>
									<td class="tabular px-3 py-1.5 text-right">{formatShare(row.weighted)}</td>
									<td class="tabular py-1.5 pl-3 text-right {far ? 'text-danger font-semibold' : ''}">
										{row.weighted === null || row.target === null
											? ''
											: formatPoints(row.weighted - row.target)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Panel>
		{/each}

		<Panel
			title="Impact sur une variable d'intérêt"
			description="Ce que le redressement change à une question de l'enquête. C'est ici que se lit l'effet réel des poids sur les résultats."
		>
			{#if quality.interests.length === 0}
				<p class="text-muted text-sm">Aucune question croisable dans cette enquête.</p>
			{:else}
				<form method="GET" class="mb-4 flex flex-wrap items-end gap-3">
					<label class="flex flex-col gap-1.5">
						<span class="text-sm font-semibold">Question</span>
						<select
							name="variable"
							class="border-ink/20 bg-paper rounded-field min-h-11 max-w-full border px-3 py-2"
						>
							{#each quality.interests as question (question.code)}
								<option value={question.code} selected={question.code === quality.impact?.code}>
									{question.label}{question.calibrated ? ' (variable de calage)' : ''}
								</option>
							{/each}
						</select>
					</label>
					<button
						type="submit"
						class="border-ink/25 bg-paper press rounded-pill inline-flex min-h-11 items-center border px-4 py-2 text-sm font-semibold"
					>
						Comparer
					</button>
				</form>

				{#if quality.impact}
					{@const impact = quality.impact}
					<EChart
						svg={impact.chart.svg}
						option={impact.chart.option}
						height={impact.chart.height}
						label="Répartition brute et redressée de « {impact.label} »"
					/>
					<div class="mt-3 overflow-x-auto">
						<table class="w-full min-w-md text-sm">
							<caption class="sr-only">Impact du redressement sur « {impact.label} »</caption>
							<thead class="text-muted text-left text-xs">
								<tr>
									<th scope="col" class="py-1.5 pr-3 font-semibold">Modalité</th>
									<th scope="col" class="px-3 py-1.5 text-right font-semibold">Brut</th>
									<th scope="col" class="px-3 py-1.5 text-right font-semibold">Redressé</th>
									<th scope="col" class="py-1.5 pl-3 text-right font-semibold">Effet</th>
								</tr>
							</thead>
							<tbody>
								{#each impact.rows as row (row.label)}
									<tr class="border-ink/10 border-t">
										<th scope="row" class="py-1.5 pr-3 text-left font-normal">{row.label}</th>
										{#if row.suppressed}
											<td colspan="3" class="text-muted py-1.5 pl-3 text-right">{SUPPRESSED_LABEL}</td>
										{:else}
											<td class="tabular px-3 py-1.5 text-right">{formatShare(row.raw)}</td>
											<td class="tabular px-3 py-1.5 text-right">{formatShare(row.weighted)}</td>
											<td class="tabular py-1.5 pl-3 text-right">
												{row.raw === null || row.weighted === null
													? ''
													: formatPoints(row.weighted - row.raw)}
											</td>
										{/if}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<p class="text-muted mt-2 text-xs">
						Base : {formatCount(impact.respondents)} répondants. Les parts sont calculées sur les répondants
						à la question, non-réponse comprise.
					</p>
				{/if}
			{/if}
		</Panel>
	</div>
{/if}
