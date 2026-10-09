<script lang="ts">
	import EChart from '$components/explorer/EChart.svelte';
	import {
		formatCount,
		formatDate,
		formatDecimal,
		formatFieldwork,
		formatMargin,
		formatPoints,
		formatShare,
		SUPPRESSED_LABEL
	} from '$shared/format';
	import {
		PARAM_READING,
		PARAM_REPORT_ANSWER,
		PARAM_REPORT_GROUP,
		PARAM_REPORT_QUESTION,
		WEIGHTED_READING
	} from '$shared/explore';
	import type { NoteRun } from '$lib/server/survey/weighting-note';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const fiche = $derived(`/donnees/${data.survey.slug}`);

	/**
	 * Changer de question change la liste des reponses : on recharge tout de
	 * suite, sinon le second menu proposerait les reponses de l ancienne
	 * question. Sans JavaScript, le bouton fait le meme travail.
	 */
	function onQuestionChange(event: Event & { currentTarget: HTMLSelectElement }): void {
		event.currentTarget.form?.requestSubmit();
	}
</script>

{#snippet runs(
	items: readonly NoteRun[]
)}{#each items as run, index (index)}{#if run.style === 'em'}<em>{run.text}</em
			>{:else if run.style === 'sub'}<sub>{run.text}</sub>{:else}{run.text}{/if}{/each}{/snippet}

<!-- Une part et sa marge d erreur, dans la meme case : on ne lit pas l une sans l autre. -->
{#snippet share(value: number | null, margin: number | null)}
	<span class="tabular block">{formatShare(value)}</span>
	<span class="tabular text-muted block text-xs">{formatMargin(margin)}</span>
{/snippet}

<svelte:head>
	<title>Redressement, {data.survey.title} | Humanitour</title>
	<meta
		name="description"
		content="Ce que le redressement change aux résultats de l'enquête « {data.survey
			.title} » : chaque chiffre redressé à côté du chiffre brut, avec sa marge d'erreur."
	/>
</svelte:head>

<!--
	Bandeau au degrade de marque, texte noir : l enquete se presente ici, et
	nulle part ailleurs sur la page (DESIGN.md, « Ce que chaque page recoit »).
-->
<header class="surface-mesh relative isolate overflow-hidden">
	<div class="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
		<nav class="mb-6 text-sm" aria-label="Fil d'Ariane">
			<a href="/donnees" class="underline decoration-2 underline-offset-2">Les données</a>
			<span aria-hidden="true"> / </span>
			<a href={fiche} class="underline decoration-2 underline-offset-2">{data.survey.title}</a>
			<span aria-hidden="true"> / </span>
			<span class="font-semibold">Redressement</span>
		</nav>

		<h1 class="max-w-3xl text-4xl sm:text-5xl">Ce que change le redressement</h1>
		<p class="measure mt-4 text-lg leading-relaxed">
			Chaque chiffre redressé est posé à côté du chiffre brut, avec sa marge d'erreur. Les données
			brutes restent la référence.
		</p>

		<dl class="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
			<div class="bg-paper rounded-panel px-4 py-3">
				<dt class="text-muted text-xs tracking-wide uppercase">Répondants</dt>
				<dd class="tabular mt-1 text-2xl font-bold">{formatCount(data.facts.respondents)}</dd>
			</div>
			<div class="bg-paper rounded-panel px-4 py-3">
				<dt class="text-muted text-xs tracking-wide uppercase">Taille effective</dt>
				<dd class="tabular mt-1 text-2xl font-bold">
					{formatCount(Math.round(data.facts.effectiveSampleSize))}
				</dd>
			</div>
			<div class="bg-paper rounded-panel px-4 py-3">
				<dt class="text-muted text-xs tracking-wide uppercase">Effet de plan</dt>
				<dd class="tabular mt-1 text-2xl font-bold">{formatDecimal(data.facts.designEffect, 2)}</dd>
			</div>
		</dl>

		<p class="mt-6 text-sm">
			Version {data.facts.version}, calculée le {formatDate(data.facts.computedAt)}.
			{formatFieldwork(data.survey.fieldworkStart, data.survey.fieldworkEnd)}.
		</p>

		<div class="mt-6 flex flex-wrap gap-3">
			<a
				href="{fiche}/redressement/note.pdf"
				data-sveltekit-reload
				download
				class="bg-ink text-paper press rounded-pill inline-flex min-h-11 items-center px-6 py-2.5 font-semibold"
			>
				Télécharger la note (PDF)
			</a>
			<a
				href="{fiche}?{PARAM_READING}={WEIGHTED_READING}"
				class="border-ink bg-paper press rounded-pill inline-flex min-h-11 items-center border-2 px-6 py-2.5 font-semibold"
			>
				Explorer les données redressées
			</a>
		</div>
	</div>
</header>

<div class="bg-paper">
	<div class="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
		{#if !data.fresh}
			<p
				class="border-coral-ink bg-coral-wash rounded-field mb-10 border-l-4 px-4 py-3 text-sm leading-relaxed"
				role="status"
			>
				Des réponses sont arrivées depuis ce calcul et n'ont pas encore de poids. La note ci-dessous
				décrit le calcul tel qu'il a eu lieu ; les comparaisons reviendront avec le prochain calcul.
			</p>
		{/if}

		{#if data.fresh && data.comparisons.length === 0}
			<section aria-labelledby="comparaisons">
				<h2 id="comparaisons">Les comparaisons</h2>
				<p class="measure text-ink-soft mt-3 leading-relaxed">
					Toutes les questions croisables de cette enquête servent au calage : leur part redressée
					est leur cible, détaillée dans la note ci-dessous.
				</p>
			</section>
		{/if}

		{#if data.shifts.length > 0}
			<section aria-labelledby="deplacements">
				<h2 id="deplacements">Les plus forts déplacements</h2>
				<p class="measure text-ink-soft mt-3 leading-relaxed">
					Les réponses dont la part bouge le plus entre la lecture brute et la lecture redressée,
					toutes questions confondues. Un écart plus grand que la marge d'erreur du brut est un
					déplacement que l'aléa de l'échantillon n'explique pas à lui seul.
				</p>

				<div class="mt-6 overflow-x-auto">
					<table class="w-full min-w-2xl text-sm">
						<caption class="sr-only">Les réponses les plus déplacées par le redressement</caption>
						<thead class="text-muted text-left text-xs">
							<tr>
								<th scope="col" class="py-2 pr-3 font-semibold">Question</th>
								<th scope="col" class="px-3 py-2 font-semibold">Réponse</th>
								<th scope="col" class="px-3 py-2 text-right font-semibold">Brut</th>
								<th scope="col" class="px-3 py-2 text-right font-semibold">Redressé</th>
								<th scope="col" class="px-3 py-2 text-right font-semibold">Écart</th>
								<th scope="col" class="py-2 pl-3 text-right font-semibold">Au-delà de la marge</th>
							</tr>
						</thead>
						<tbody>
							{#each data.shifts as shift (`${shift.questionCode}:${shift.row.key}`)}
								<tr class="border-ink/12 border-t align-top">
									<td class="py-2.5 pr-3">
										<a
											href="#question-{shift.questionCode}"
											class="underline decoration-1 underline-offset-2">{shift.questionLabel}</a
										>
									</td>
									<th scope="row" class="px-3 py-2.5 text-left font-semibold">{shift.row.label}</th>
									<td class="px-3 py-2.5 text-right">
										{@render share(shift.row.raw, shift.row.rawMargin)}
									</td>
									<td class="px-3 py-2.5 text-right">
										{@render share(shift.row.weighted, shift.row.weightedMargin)}
									</td>
									<td class="tabular px-3 py-2.5 text-right font-semibold">
										{formatPoints(shift.row.gap)}
									</td>
									<td class="py-2.5 pl-3 text-right">{shift.row.beyondMargin ? 'Oui' : 'Non'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/if}

		{#if data.comparisons.length > 0}
			<section class="mt-16" aria-labelledby="questions">
				<h2 id="questions">Question par question</h2>
				<p class="measure text-ink-soft mt-3 leading-relaxed">
					Toutes les réponses de chaque question, non-réponse comprise. Les variables de calage n'y
					figurent pas : leur part redressée est leur cible, détaillée plus bas.
				</p>

				<nav class="mt-6" aria-label="Questions de l'enquête">
					<ul class="flex flex-wrap gap-2">
						{#each data.comparisons as comparison (comparison.code)}
							<li>
								<a
									href="#question-{comparison.code}"
									class="bg-cream rounded-pill press inline-flex min-h-11 items-center px-4 py-2 text-sm"
									>{comparison.label}</a
								>
							</li>
						{/each}
					</ul>
				</nav>

				<div class="mt-8 flex flex-col gap-12">
					{#each data.comparisons as comparison (comparison.code)}
						<article
							id="question-{comparison.code}"
							class="border-ink/12 rounded-block scroll-mt-24 border p-5 sm:p-8"
							aria-labelledby="titre-{comparison.code}"
						>
							<!-- Le libelle exact de la question : la formulation fait partie du resultat. -->
							<h3 id="titre-{comparison.code}" class="text-xl leading-snug">{comparison.label}</h3>
							<p class="text-muted mt-2 text-sm">
								{formatCount(comparison.respondents)} répondants, soit une taille effective de {formatCount(
									Math.round(comparison.effectiveRespondents)
								)} une fois redressés.
							</p>

							<div class="mt-6 grid items-start gap-8 lg:grid-cols-2">
								<EChart
									svg={comparison.chart.svg}
									option={comparison.chart.option}
									height={comparison.chart.height}
									label="Répartition brute et redressée de « {comparison.label} »"
								/>

								<div class="overflow-x-auto">
									<table class="w-full min-w-md text-sm">
										<caption class="sr-only">
											Parts brutes et redressées de « {comparison.label} », avec leur marge d'erreur
										</caption>
										<thead class="text-muted text-left text-xs">
											<tr>
												<th scope="col" class="py-2 pr-3 font-semibold">Réponse</th>
												<th scope="col" class="px-3 py-2 text-right font-semibold">Brut</th>
												<th scope="col" class="px-3 py-2 text-right font-semibold">Redressé</th>
												<th scope="col" class="py-2 pl-3 text-right font-semibold">Écart</th>
											</tr>
										</thead>
										<tbody>
											{#each comparison.rows as row (row.key)}
												<tr class="border-ink/12 border-t align-top">
													<th scope="row" class="py-2 pr-3 text-left font-normal">{row.label}</th>
													{#if row.suppressed}
														<td colspan="3" class="text-muted py-2 pl-3 text-right"
															>{SUPPRESSED_LABEL}</td
														>
													{:else}
														<td class="px-3 py-2 text-right"
															>{@render share(row.raw, row.rawMargin)}</td
														>
														<td class="px-3 py-2 text-right">
															{@render share(row.weighted, row.weightedMargin)}
														</td>
														<td class="py-2 pl-3 text-right">
															<span class="tabular block font-semibold"
																>{formatPoints(row.gap)}</span
															>
															{#if row.beyondMargin}
																<span class="text-muted block text-xs">au-delà de la marge</span>
															{/if}
														</td>
													{/if}
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							</div>

							<a
								href={comparison.exploreUrl}
								class="mt-6 inline-block text-sm font-semibold underline decoration-2 underline-offset-2"
							>
								Ouvrir cette question dans l'explorateur, en lecture redressée
							</a>
						</article>
					{/each}
				</div>
			</section>
		{/if}

		{#if data.subgroup}
			{@const subgroup = data.subgroup}
			<section class="mt-16" aria-labelledby="sous-groupes">
				<h2 id="sous-groupes">Par sous-groupe</h2>
				<p class="measure text-ink-soft mt-3 leading-relaxed">
					Une réponse, lue dans chaque sous-groupe. Le redressement ne change rien à l'intérieur
					d'un groupe de calage, où tous les poids se valent : c'est en croisant avec les autres
					variables que les écarts apparaissent.
				</p>

				<form
					method="GET"
					action="#sous-groupes"
					data-sveltekit-noscroll
					data-sveltekit-keepfocus
					class="mt-6 grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]"
				>
					<label class="flex min-w-0 flex-col gap-2">
						<span class="font-semibold">Question</span>
						<select
							name={PARAM_REPORT_QUESTION}
							value={subgroup.selection.question}
							onchange={onQuestionChange}
							class="border-ink/20 rounded-field bg-paper min-h-11 w-full min-w-0 border px-3 py-2.5"
						>
							{#each subgroup.questions as question (question.code)}
								<option value={question.code}>{question.label}</option>
							{/each}
						</select>
					</label>
					<label class="flex min-w-0 flex-col gap-2">
						<span class="font-semibold">Réponse</span>
						<select
							name={PARAM_REPORT_ANSWER}
							value={subgroup.selection.modality}
							class="border-ink/20 rounded-field bg-paper min-h-11 w-full min-w-0 border px-3 py-2.5"
						>
							{#each subgroup.answers as answer (answer.key)}
								<option value={answer.key}>{answer.label}</option>
							{/each}
						</select>
					</label>
					<label class="flex min-w-0 flex-col gap-2">
						<span class="font-semibold">Selon</span>
						<select
							name={PARAM_REPORT_GROUP}
							value={subgroup.selection.group}
							class="border-ink/20 rounded-field bg-paper min-h-11 w-full min-w-0 border px-3 py-2.5"
						>
							{#each subgroup.groups as group (group.code)}
								<option value={group.code}>{group.label}</option>
							{/each}
						</select>
					</label>
					<button
						type="submit"
						class="bg-ink text-paper press rounded-pill inline-flex min-h-11 items-center justify-center px-6 py-2.5 font-semibold"
					>
						Comparer
					</button>
				</form>

				<div class="border-ink/12 rounded-block mt-8 border p-5 sm:p-8">
					<h3 class="text-xl leading-snug">
						« {subgroup.answers.find((answer) => answer.key === subgroup.selection.modality)?.label} »,
						selon « {subgroup.groupLabel} »
					</h3>
					<p class="text-muted mt-2 text-sm">Question : « {subgroup.questionLabel} ».</p>

					{#if subgroup.result && subgroup.chart}
						<div class="mt-6 grid items-start gap-8 lg:grid-cols-2">
							<EChart
								svg={subgroup.chart.svg}
								option={subgroup.chart.option}
								height={subgroup.chart.height}
								label="Part brute et redressée de « {subgroup.result.modality
									.label} » selon « {subgroup.groupLabel} »"
							/>

							<div class="overflow-x-auto">
								<table class="w-full min-w-lg text-sm">
									<caption class="sr-only">
										Part brute et redressée de « {subgroup.result.modality.label} » dans chaque sous-groupe
									</caption>
									<thead class="text-muted text-left text-xs">
										<tr>
											<th scope="col" class="py-2 pr-3 font-semibold">Sous-groupe</th>
											<th scope="col" class="px-3 py-2 text-right font-semibold">Répondants</th>
											<th scope="col" class="px-3 py-2 text-right font-semibold">Brut</th>
											<th scope="col" class="px-3 py-2 text-right font-semibold">Redressé</th>
											<th scope="col" class="py-2 pl-3 text-right font-semibold">Écart</th>
										</tr>
									</thead>
									<tbody>
										{#if subgroup.overall}
											<tr class="border-ink border-t-2 align-top">
												<th scope="row" class="py-2 pr-3 text-left font-semibold">Ensemble</th>
												<td class="tabular px-3 py-2 text-right">
													{formatCount(subgroup.overallRespondents)}
													<span class="text-muted block text-xs"
														>taille effective {formatCount(
															Math.round(subgroup.overallEffective)
														)}</span
													>
												</td>
												<td class="px-3 py-2 text-right">
													{@render share(subgroup.overall.raw, subgroup.overall.rawMargin)}
												</td>
												<td class="px-3 py-2 text-right">
													{@render share(
														subgroup.overall.weighted,
														subgroup.overall.weightedMargin
													)}
												</td>
												<td class="tabular py-2 pl-3 text-right font-semibold">
													{formatPoints(subgroup.overall.gap)}
												</td>
											</tr>
										{/if}
										{#each subgroup.result.rows as row (row.key)}
											<tr class="border-ink/12 border-t align-top">
												<th scope="row" class="py-2 pr-3 text-left font-normal">{row.label}</th>
												{#if row.suppressed}
													<td colspan="4" class="text-muted py-2 pl-3 text-right"
														>{SUPPRESSED_LABEL}</td
													>
												{:else}
													<td class="tabular px-3 py-2 text-right">
														{formatCount(row.respondents)}
														<span class="text-muted block text-xs"
															>taille effective {formatCount(
																Math.round(row.effectiveRespondents ?? 0)
															)}</span
														>
													</td>
													<td class="px-3 py-2 text-right"
														>{@render share(row.raw, row.rawMargin)}</td
													>
													<td class="px-3 py-2 text-right">
														{@render share(row.weighted, row.weightedMargin)}
													</td>
													<td class="py-2 pl-3 text-right">
														<span class="tabular block font-semibold">{formatPoints(row.gap)}</span>
														{#if row.beyondMargin}
															<span class="text-muted block text-xs">au-delà de la marge</span>
														{/if}
													</td>
												{/if}
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					{:else}
						<p class="measure text-ink-soft mt-4 leading-relaxed">
							Cette réponse n'apparaît pas dans le croisement demandé. Choisissez une autre réponse
							ou un autre sous-groupe.
						</p>
					{/if}

					<a
						href={subgroup.exploreUrl}
						class="mt-6 inline-block text-sm font-semibold underline decoration-2 underline-offset-2"
					>
						Ouvrir ce croisement dans l'explorateur
					</a>
				</div>
			</section>
		{/if}

		{#if data.comparisons.length > 0}
			<aside class="bg-cream rounded-block mt-16 p-8 sm:p-12" aria-labelledby="marge">
				<h2 id="marge" class="text-xl">Lire les marges d'erreur</h2>
				<p class="measure text-ink-soft mt-4 leading-relaxed">
					Sous chaque part figure la demi-largeur de son intervalle de confiance à 95 %, calculée
					comme pour un échantillon aléatoire simple : sur le nombre de répondants pour le brut, sur
					la taille effective pour le redressé. Le redressement élargit donc la marge, et c'est le
					prix de la correction. L'échantillon n'étant pas tiré au hasard, ces marges donnent un
					ordre de grandeur, pas une garantie.
				</p>
				<p class="measure text-ink-soft mt-3 leading-relaxed">
					« {SUPPRESSED_LABEL} » remplace les chiffres qui reposent sur moins de {data.threshold}
					répondants, dans les deux lectures.
				</p>
			</aside>
		{/if}

		<section class="mt-16" aria-labelledby="note">
			<h2 id="note">La note méthodologique</h2>
			<p class="measure text-ink-soft mt-3 leading-relaxed">
				Le texte du PDF, avec les marges de calage : pour chaque variable, l'échantillon brut, la
				cible de population, l'échantillon redressé et l'écart qui reste.
			</p>

			<div class="prose-note mt-8 flex flex-col gap-10 leading-relaxed">
				{#each data.note.sections as section (section.title)}
					<section>
						<h3>{section.title}</h3>
						{#each section.blocks as block, index (index)}
							{#if block.kind === 'paragraph'}
								<p class="measure">{@render runs(block.runs)}</p>
							{:else if block.kind === 'margins'}
								{@const chart = data.marginCharts[block.code]}
								<div class="border-ink/12 rounded-block mt-6 border p-5 sm:p-8">
									<h4 class="font-semibold">
										{block.label}
										<span class="text-muted font-normal">({block.provenance})</span>
									</h4>
									<div class="mt-4 grid items-start gap-8 lg:grid-cols-2">
										{#if chart}
											<EChart
												svg={chart.svg}
												option={chart.option}
												height={chart.height}
												label="Marges brute, cible et redressée : {block.label}"
											/>
										{/if}
										<div class="overflow-x-auto">
											<table class="w-full min-w-lg text-sm">
												<caption class="sr-only">Marges de calage : {block.label}</caption>
												<thead class="text-muted text-left text-xs">
													<tr>
														<th scope="col" class="py-2 pr-3 font-semibold">Modalité</th>
														{#each data.note.marginColumns as column (column)}
															<th scope="col" class="px-2 py-2 text-right font-semibold"
																>{column}</th
															>
														{/each}
													</tr>
												</thead>
												<tbody>
													{#each block.rows as row (row.key)}
														<tr class="border-ink/12 border-t">
															<th scope="row" class="py-1.5 pr-3 text-left font-normal"
																>{row.label}</th
															>
															<td class="tabular px-2 py-1.5 text-right">{row.observed}</td>
															<td class="tabular px-2 py-1.5 text-right">{row.target}</td>
															<td class="tabular px-2 py-1.5 text-right">{row.weighted}</td>
															<td
																class="tabular py-1.5 pl-2 text-right {row.far
																	? 'font-bold underline decoration-2 underline-offset-2'
																	: ''}">{row.deviation}</td
															>
														</tr>
													{/each}
												</tbody>
											</table>
										</div>
									</div>
									{#if block.rows.some((row) => row.far)}
										<p class="text-muted mt-3 text-xs">
											En gras et souligné : un écart de plus d'un point à la cible.
										</p>
									{/if}
									{#if block.footnote}
										<p class="text-muted mt-3 text-xs">{block.footnote}</p>
									{/if}
								</div>
							{:else}
								<table class="mt-4 w-full max-w-lg text-sm">
									<tbody>
										{#each block.rows as row (row.label)}
											<tr class="border-ink/12 border-t">
												<th scope="row" class="py-1.5 pr-3 text-left font-normal">{row.label}</th>
												<td class="tabular py-1.5 pl-3 text-right">{row.value}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							{/if}
						{/each}
					</section>
				{/each}
			</div>
		</section>
	</div>
</div>

<style>
	.prose-note :global(h3) {
		font-size: 1.15rem;
		font-weight: 700;
		margin-bottom: 0.75rem;
	}

	.prose-note :global(p + p) {
		margin-top: 0.75rem;
	}
</style>
