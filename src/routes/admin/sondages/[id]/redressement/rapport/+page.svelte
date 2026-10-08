<script lang="ts">
	import Panel from '$components/admin/Panel.svelte';
	import type { NoteRun } from '$lib/server/survey/weighting-note';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const base = $derived(`/admin/sondages/${data.survey.id}/redressement`);
</script>

{#snippet runs(
	items: readonly NoteRun[]
)}{#each items as run, index (index)}{#if run.style === 'em'}<em>{run.text}</em
			>{:else if run.style === 'sub'}<sub>{run.text}</sub>{:else}{run.text}{/if}{/each}{/snippet}

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
			description="La note méthodologique se télécharge en PDF, à la charte de l'association : c'est le document à remettre à un partenaire. Le fichier des poids donne, pour chaque répondant, sa modalité sur chaque variable de calage et son poids à six décimales : de quoi refaire tous les chiffres redressés dans R, Python ou un tableur."
		>
			<div class="flex flex-wrap gap-3">
				<a
					href="{base}/rapport/note.pdf"
					download
					class="bg-ink text-paper press rounded-pill inline-flex min-h-11 items-center px-5 py-2.5 text-sm font-semibold"
				>
					Télécharger la note (PDF, version {note.version})
				</a>
				<a
					href="{base}/rapport/poids.csv"
					download
					class="border-ink/25 bg-paper press rounded-pill inline-flex min-h-11 items-center border px-5 py-2.5 text-sm font-semibold"
				>
					Télécharger les poids (CSV, version {note.version})
				</a>
			</div>
		</Panel>

		<article class="panel p-6 sm:p-10" aria-labelledby="note-title">
			<header class="border-ink/12 mb-8 border-b pb-6">
				<p class="text-muted text-sm">{note.eyebrow}</p>
				<h2 id="note-title" class="mt-2 text-2xl font-bold">
					{note.title} de l'enquête « {note.subject} »
				</h2>
				<p class="text-muted mt-2 text-sm">{note.subtitle}</p>
			</header>

			<div class="prose-note flex flex-col gap-8 text-[0.95rem] leading-relaxed">
				{#each note.sections as section (section.title)}
					<section>
						<h3>{section.title}</h3>
						{#each section.blocks as block, index (index)}
							{#if block.kind === 'paragraph'}
								<p>{@render runs(block.runs)}</p>
							{:else if block.kind === 'margins'}
								<div class="mt-4 overflow-x-auto">
									<table class="w-full min-w-xl text-sm">
										<caption class="mb-2 text-left font-semibold">
											{block.label}
											<span class="text-muted font-normal">({block.provenance})</span>
										</caption>
										<thead class="text-muted text-left text-xs">
											<tr>
												<th scope="col" class="py-1 pr-3 font-semibold">Modalité</th>
												{#each note.marginColumns as column, position (column)}
													<th
														scope="col"
														class="py-1 text-right font-semibold {position ===
														note.marginColumns.length - 1
															? 'pl-3'
															: 'px-3'}">{column}</th
													>
												{/each}
											</tr>
										</thead>
										<tbody>
											{#each block.rows as row (row.key)}
												<tr class="border-ink/10 border-t">
													<th scope="row" class="py-1 pr-3 text-left font-normal">{row.label}</th>
													<td class="tabular px-3 py-1 text-right">{row.observed}</td>
													<td class="tabular px-3 py-1 text-right">{row.target}</td>
													<td class="tabular px-3 py-1 text-right">{row.weighted}</td>
													<td
														class="tabular py-1 pl-3 text-right {row.far
															? 'text-danger font-semibold'
															: ''}">{row.deviation}</td
													>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
								{#if block.footnote}
									<p class="text-muted mt-1 text-xs">{block.footnote}</p>
								{/if}
							{:else}
								<table class="w-full max-w-lg text-sm">
									<tbody>
										{#each block.rows as row (row.label)}
											<tr class="border-ink/10 border-t">
												<th scope="row" class="py-1 pr-3 text-left font-normal">{row.label}</th>
												<td class="tabular py-1 pl-3 text-right">{row.value}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							{/if}
						{/each}
					</section>
				{/each}
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

	.prose-note :global(p + p),
	.prose-note :global(table + p) {
		margin-top: 0.75rem;
	}
</style>
