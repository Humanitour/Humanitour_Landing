<script lang="ts">
	import EmptyState from '$components/admin/EmptyState.svelte';
	import PageHeader from '$components/admin/PageHeader.svelte';
	import Panel from '$components/admin/Panel.svelte';
	import Table from '$components/admin/Table.svelte';
	import { formatCount, formatDate, formatShare } from '$lib/shared/format';
	import { can } from '$lib/shared/permissions';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * Adresse de la page avec un autre filtre ou une autre page.
	 *
	 * Le filtre vit dans l'URL et non dans un etat local : il se partage avec
	 * un collegue, survit au rechargement et fonctionne sans JavaScript.
	 */
	function href(params: { q?: string | null; m?: string | null; page?: number | null }): string {
		const q = params.q === undefined ? data.filter?.questionCode : params.q;
		const m = params.m === undefined ? data.filter?.modalityKey : params.m;
		const pairs: [string, string][] = [];
		if (q && m) pairs.push(['q', q], ['m', m]);
		if (params.page && params.page > 1) pairs.push(['page', String(params.page)]);
		const query = pairs.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
		return query ? `?${query}` : '?';
	}

	const isActive = (code: string, key: string) =>
		data.filter?.questionCode === code && data.filter.modalityKey === key;

	/** Une colonne par question : la largeur suit le questionnaire. */
	const tableWidth = $derived(`${12 + data.questions.length * 13}rem`);
</script>

<svelte:head><title>Réponses — {data.survey.title}</title></svelte:head>

<PageHeader
	title="Réponses"
	breadcrumb={[
		{ label: 'Sondages', href: '/admin/sondages' },
		{ label: data.survey.title, href: `/admin/sondages/${data.survey.id}` }
	]}
	description="Le miroir tel qu'il est en base, sans seuil d'anonymat : ces chiffres ne quittent pas le back-office."
>
	{#snippet actions()}
		{#if can(data.user, 'survey.sync')}
			<a
				href="/admin/sondages/{data.survey.id}/openforms"
				class="border-ink/25 bg-paper press rounded-pill inline-flex min-h-11 items-center justify-center border px-4 py-2 text-sm font-semibold"
			>
				Collecte Openforms
			</a>
		{/if}
	{/snippet}
</PageHeader>

{#if data.total === 0}
	<EmptyState
		title="Aucune réponse reprise"
		description={data.survey.syncedAt
			? `La dernière synchronisation, le ${formatDate(data.survey.syncedAt)}, n'a rien repris. Vérifiez la correspondance des champs.`
			: "Cette enquête n'a jamais été synchronisée. Reliez un formulaire et lancez une passe depuis la collecte Openforms."}
	/>
{:else}
	<p class="mb-5 text-sm" aria-live="polite">
		{#if data.filter}
			<span class="font-semibold">{formatCount(data.filtered)}</span> répondant(s) sur
			{formatCount(data.total)} ont répondu « {data.filter.modalityLabel} » à « {data.filter
				.questionLabel} ».
			<a href={href({ q: null, m: null })} class="text-coral-ink ml-1 underline">
				Retirer le filtre
			</a>
		{:else}
			<span class="font-semibold">{formatCount(data.total)}</span> répondant(s).
			<span class="text-muted"
				>Choisissez une modalité pour restreindre la page à ceux qui l'ont donnée.</span
			>
		{/if}
	</p>

	<Panel
		title="Décompte par question"
		description="Part des {formatCount(
			data.filtered
		)} répondant(s) affichés. Un choix multiple dépasse 100 % au total."
	>
		<div class="grid gap-x-8 gap-y-6 md:grid-cols-2">
			{#each data.questions as question (question.id)}
				<section aria-labelledby="tally-{question.id}">
					<h3 id="tally-{question.id}" class="text-sm font-semibold">{question.label}</h3>
					<ul class="mt-2 flex flex-col">
						{#each question.tally.rows as row (row.key)}
							<li>
								<a
									href={isActive(question.code, row.key)
										? href({ q: null, m: null })
										: href({ q: question.code, m: row.key })}
									aria-current={isActive(question.code, row.key) ? 'true' : undefined}
									class="rounded-field hover:bg-cream grid min-h-11 grid-cols-[1fr_auto] items-center gap-x-3 px-2 py-1 text-sm {isActive(
										question.code,
										row.key
									)
										? 'bg-cream font-semibold'
										: ''}"
								>
									<span class="min-w-0 truncate {row.isNonResponse ? 'text-muted italic' : ''}">
										{row.label}
									</span>
									<span class="tabular text-right">
										{formatCount(row.count)}
										<span class="text-muted ml-1 text-xs">{formatShare(row.share)}</span>
									</span>
									<span
										class="bg-ink/10 col-span-2 mt-1 block h-1.5 rounded-full"
										aria-hidden="true"
									>
										<span
											class="block h-full rounded-full {row.isNonResponse
												? 'bg-muted'
												: 'bg-coral'}"
											style:width="{Math.min(row.share, 1) * 100}%"
										></span>
									</span>
								</a>
							</li>
						{:else}
							<li class="text-muted px-2 text-sm">Aucune modalité déclarée ni observée.</li>
						{/each}
					</ul>
					{#if question.tally.missing > 0}
						<p class="text-muted mt-1 px-2 text-xs">
							{formatCount(question.tally.missing)} répondant(s) sans réponse enregistrée : la question
							n'était pas reliée quand leur soumission a été reprise.
						</p>
					{/if}
				</section>
			{/each}
		</div>
	</Panel>

	<h2 class="mt-8 mb-3 text-base font-semibold">Réponse par réponse</h2>
	<Table
		empty={data.responses.length === 0}
		emptyTitle="Aucun répondant pour ce filtre"
		minWidth={tableWidth}
	>
		{#snippet head()}
			<th class="bg-cream sticky left-0 px-4 py-3 text-left whitespace-nowrap">Reçue le</th>
			{#each data.questions as question (question.id)}
				<th class="max-w-52 px-3 py-3 text-left font-semibold" title={question.label}>
					<span class="line-clamp-2">{question.label}</span>
				</th>
			{/each}
		{/snippet}

		{#snippet body()}
			{#each data.responses as response (response.id)}
				<tr class="border-ink/12 border-t align-top">
					<td class="bg-paper sticky left-0 px-4 py-2 whitespace-nowrap">
						{formatDate(response.collectedAt)}
					</td>
					{#each response.cells as cell, index (data.questions[index]?.id ?? index)}
						<td class="max-w-52 px-3 py-2">
							{#if cell.missing}
								<span class="text-muted" aria-label="Pas de réponse enregistrée">·</span>
							{:else}
								<span
									class="line-clamp-3 {cell.isNonResponse ? 'text-muted italic' : ''}"
									title={cell.text}>{cell.text}</span
								>
							{/if}
						</td>
					{/each}
				</tr>
			{/each}
		{/snippet}
	</Table>

	{#if data.window.pageCount > 1}
		<nav
			aria-label="Pages de réponses"
			class="mt-4 flex flex-wrap items-center justify-between gap-3"
		>
			<span class="text-muted text-sm">
				Page {data.window.page} sur {data.window.pageCount}
			</span>
			<div class="flex gap-2">
				{#if data.window.page > 1}
					<a
						href={href({ page: data.window.page - 1 })}
						class="border-ink/25 bg-paper press rounded-pill inline-flex min-h-11 items-center border px-4 py-2 text-sm font-medium"
					>
						Plus récentes
					</a>
				{/if}
				{#if data.window.page < data.window.pageCount}
					<a
						href={href({ page: data.window.page + 1 })}
						class="border-ink/25 bg-paper press rounded-pill inline-flex min-h-11 items-center border px-4 py-2 text-sm font-medium"
					>
						Plus anciennes
					</a>
				{/if}
			</div>
		</nav>
	{/if}
{/if}
