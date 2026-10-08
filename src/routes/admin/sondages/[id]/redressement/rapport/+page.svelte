<script lang="ts">
	import Panel from '$components/admin/Panel.svelte';
	import {
		formatCount,
		formatDate,
		formatDecimal,
		formatFieldwork,
		formatPoints,
		formatShare
	} from '$lib/shared/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const base = $derived(`/admin/sondages/${data.survey.id}/redressement`);
</script>

{#if !data.note}
	<Panel title="Rapport et export">
		<p class="text-sm">
			La note méthodologique et le fichier des poids décrivent un calcul qui a eu lieu.
			<a href="{base}/calcul" class="text-coral-ink underline">Lancez le calcul</a> pour les obtenir.
		</p>
	</Panel>
{:else}
	{@const note = data.note}
	<div class="flex flex-col gap-6">
		<Panel
			title="Exporter"
			description="Le fichier des poids donne, pour chaque répondant, sa modalité sur chaque variable de calage et son poids à six décimales : de quoi refaire tous les chiffres redressés dans R, Python ou un tableur."
		>
			<div class="flex flex-wrap gap-3">
				<a
					href="{base}/rapport/poids.csv"
					download
					class="bg-ink text-paper press rounded-pill inline-flex min-h-11 items-center px-5 py-2.5 text-sm font-semibold"
				>
					Télécharger les poids (CSV, version {note.version})
				</a>
				<button
					type="button"
					onclick={() => window.print()}
					class="border-ink/25 bg-paper press rounded-pill inline-flex min-h-11 items-center border px-5 py-2.5 text-sm font-semibold"
				>
					Imprimer la note ou l'enregistrer en PDF
				</button>
			</div>
		</Panel>

		<article class="note panel p-6 sm:p-10" aria-labelledby="note-title">
			<header class="border-ink/12 mb-8 border-b pb-6">
				<p class="text-muted text-sm">Humanitour, institut de sondage citoyen · Note méthodologique</p>
				<h2 id="note-title" class="mt-2 text-2xl font-bold">
					Redressement de l'enquête « {data.survey.title} »
				</h2>
				<p class="text-muted mt-2 text-sm">
					Version {note.version} du redressement, calculée le {formatDate(note.computedAt)}.
				</p>
			</header>

			<div class="prose-note flex flex-col gap-8 text-[0.95rem] leading-relaxed">
				<section>
					<h3>1. Données</h3>
					<p>
						L'échantillon compte {formatCount(note.respondents)} répondants, dont les réponses ont été
						recueillies par le questionnaire de l'association sur forms.humanitour.fr.{#if formatFieldwork(note.fieldworkStart, note.fieldworkEnd)}
							{formatFieldwork(note.fieldworkStart, note.fieldworkEnd)}.{/if}
						L'échantillon n'est pas issu d'un tirage aléatoire : les poids initiaux sont donc tous égaux
						à 1, et le redressement ne s'appuie sur aucun poids de sondage.
					</p>
				</section>

				<section>
					<h3>2. Méthode</h3>
					<p>
						Les poids sont obtenus par calage sur marges, selon la méthode de Deville et Särndal (1992),
						avec la fonction de distance raking ratio (exponentielle). Le calcul emploie l'algorithme de
						calage itératif proportionnel (Deming et Stephan, 1940) : à chaque itération, les poids sont
						ajustés variable par variable pour que, pour chaque modalité <em>j</em>, la somme des poids
						des répondants de la modalité rejoigne le total marginal visé, Σ<sub>k</sub> w<sub>k</sub>
						x<sub>kj</sub> = T<sub>j</sub>. Sans bornes et à convergence, cette procédure donne
						l'estimateur par calage de la méthode raking ratio de la macro CALMAR de l'Insee. Les poids
						sont strictement positifs, puis ramenés à une moyenne de 1 : leur somme égale l'effectif de
						l'échantillon.
					</p>
					{#if note.settings}
						<p>
							Critère d'arrêt : écart maximal entre une marge obtenue et sa cible inférieur à ε = {formatDecimal(
								note.settings.tolerance,
								8
							)} (en part), dans la limite de {note.settings.maxIterations} itérations.
							{#if note.settings.trim}
								Les poids ont été tronqués à chaque itération dans l'intervalle [{formatDecimal(
									note.settings.minWeight,
									4
								)} ; {formatDecimal(note.settings.maxWeight, 4)}], puis renormalisés. Il s'agit d'un
								raking tronqué, distinct de la méthode logit bornée de CALMAR : il peut laisser un écart
								résiduel aux cibles, chiffré ci-dessous.
							{:else}
								Aucune troncature n'a été appliquée aux poids.
							{/if}
						</p>
					{/if}
					<p>
						{#if note.convergence.converged}
							Le calage a convergé en {note.convergence.iterations} itération{note.convergence.iterations >
							1
								? 's'
								: ''} ; l'écart maximal restant est de {formatDecimal(
								note.convergence.maxDeviation * 100,
								4
							)} point de pourcentage.
						{:else}
							Le calage n'a pas convergé en {note.convergence.iterations} itérations : l'écart maximal
							restant est de {formatDecimal(note.convergence.maxDeviation * 100, 3)} point de pourcentage.
							Les marges redressées ci-dessous doivent être lues avec cet écart.
						{/if}
					</p>
				</section>

				<section>
					<h3>3. Totaux marginaux de référence</h3>
					<p>Source des marges : {note.source ?? 'non renseignée.'}</p>
					{#if note.usesPcs}
						<p>
							Pour le groupe socioprofessionnel, le tableau {note.pcsTable} du recensement ne descend pas
							sous la tranche des 15-19 ans : la part des 18-19 ans y a été estimée en supposant la
							répartition par groupe identique à tous les âges de cette tranche.
						</p>
					{/if}

					{#each note.variables as variable (variable.code)}
						<table class="mt-4 w-full text-sm">
							<caption class="mb-2 text-left font-semibold">
								{variable.label}
								{#if variable.origin}
									<span class="text-muted font-normal">
										(recensement de la population {variable.origin.period}{variable.origin.edited
											? ', cibles retouchées à la main'
											: ''})</span
									>
								{:else}
									<span class="text-muted font-normal">(cibles saisies à la main)</span>
								{/if}
							</caption>
							<thead class="text-muted text-left text-xs">
								<tr>
									<th scope="col" class="py-1 pr-3 font-semibold">Modalité</th>
									<th scope="col" class="px-3 py-1 text-right font-semibold">Échantillon brut</th>
									<th scope="col" class="px-3 py-1 text-right font-semibold">Cible</th>
									<th scope="col" class="px-3 py-1 text-right font-semibold">Échantillon redressé</th>
									<th scope="col" class="py-1 pl-3 text-right font-semibold">Écart à la cible</th>
								</tr>
							</thead>
							<tbody>
								{#each variable.rows as row (row.key)}
									<tr class="border-ink/10 border-t">
										<th scope="row" class="py-1 pr-3 text-left font-normal">{row.label}</th>
										<td class="tabular px-3 py-1 text-right">{formatShare(row.observed)}</td>
										<td class="tabular px-3 py-1 text-right">{formatShare(row.target)}</td>
										<td class="tabular px-3 py-1 text-right">{formatShare(row.weighted)}</td>
										<td class="tabular py-1 pl-3 text-right">
											{row.weighted === null || row.target === null
												? ''
												: formatPoints(row.weighted - row.target)}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
						{#if variable.missing > 0}
							<p class="text-muted mt-1 text-xs">
								{formatCount(variable.missing)} répondant{variable.missing > 1 ? 's' : ''} sans réponse à
								cette question, conservé{variable.missing > 1 ? 's' : ''} avec un poids inchangé sur
								cette variable ; les parts ci-dessus sont calculées sur les répondants classés.
							</p>
						{/if}
					{/each}
				</section>

				<section>
					<h3>4. Qualité du redressement</h3>
					<table class="w-full max-w-lg text-sm">
						<tbody>
							<tr class="border-ink/10 border-t">
								<th scope="row" class="py-1 pr-3 text-left font-normal">Taille effective (Kish)</th>
								<td class="tabular py-1 pl-3 text-right">
									{formatCount(Math.round(note.metrics.effectiveSampleSize))} sur {formatCount(
										note.respondents
									)}
								</td>
							</tr>
							<tr class="border-ink/10 border-t">
								<th scope="row" class="py-1 pr-3 text-left font-normal"
									>Effet de plan, Deff = 1 + CV(w)²</th
								>
								<td class="tabular py-1 pl-3 text-right">{formatDecimal(note.metrics.designEffect, 3)}</td>
							</tr>
							<tr class="border-ink/10 border-t">
								<th scope="row" class="py-1 pr-3 text-left font-normal">Coefficient de variation des poids</th>
								<td class="tabular py-1 pl-3 text-right"
									>{formatDecimal(note.metrics.coefficientOfVariation, 3)}</td
								>
							</tr>
							<tr class="border-ink/10 border-t">
								<th scope="row" class="py-1 pr-3 text-left font-normal">Poids minimal et maximal</th>
								<td class="tabular py-1 pl-3 text-right">
									{formatDecimal(note.metrics.minWeight, 3)} et {formatDecimal(note.metrics.maxWeight, 3)}
								</td>
							</tr>
							<tr class="border-ink/10 border-t">
								<th scope="row" class="py-1 pr-3 text-left font-normal">Rapport w max / w min</th>
								<td class="tabular py-1 pl-3 text-right">{formatDecimal(note.metrics.weightRatio, 1)}</td>
							</tr>
							{#if note.settings?.trim}
								<tr class="border-ink/10 border-t">
									<th scope="row" class="py-1 pr-3 text-left font-normal">Répondants à une borne</th>
									<td class="tabular py-1 pl-3 text-right">{formatCount(note.metrics.atBounds)}</td>
								</tr>
							{/if}
						</tbody>
					</table>
					<p class="mt-3">
						L'effet de plan mesure la perte de précision due à la dispersion des poids : une estimation
						redressée a la précision d'un échantillon non pondéré de {formatCount(
							Math.round(note.metrics.effectiveSampleSize)
						)} personnes.
						{#if note.alert}
							Il dépasse {formatDecimal(note.alertThreshold, 1)}, seuil au-delà duquel la perte de
							précision est jugée importante : les écarts entre sous-groupes doivent être interprétés avec
							prudence.
						{/if}
					</p>
				</section>

				<section>
					<h3>5. Limites</h3>
					<p>
						Le calage corrige la structure de l'échantillon sur les seules variables de calage. Il ne
						corrige pas un biais de sélection sur des caractéristiques non observées : si les personnes
						rencontrées diffèrent de la population par leur intérêt pour la politique, à sexe, âge et
						territoire égaux, les poids n'en tiennent pas compte. Il ne crée pas non plus d'information
						sur une catégorie absente de l'échantillon.
					</p>
					<p>
						Les résultats bruts restent publiés et constituent la lecture de référence. Le poids de chaque
						répondant est conservé et exportable, et chaque version du redressement est consignée, avec
						ses marges et ses paramètres, au journal de la plateforme.
					</p>
				</section>
			</div>
		</article>
	</div>
{/if}

<style>
	.prose-note :global(h3) {
		font-size: 1.05rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
	}

	.prose-note :global(p + p) {
		margin-top: 0.75rem;
	}

	/*
	 * A l impression, la note seule : le menu, les onglets et les boutons du
	 * back-office n ont rien a faire dans un PDF remis a un partenaire.
	 */
	@media print {
		:global(body *) {
			visibility: hidden;
		}

		.note,
		.note :global(*) {
			visibility: visible;
		}

		.note {
			position: absolute;
			inset: 0 auto auto 0;
			width: 100%;
			border: 0;
			padding: 0;
		}
	}
</style>
