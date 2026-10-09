<script lang="ts">
	import { enhance } from '$app/forms';
	import EmptyState from '$components/admin/EmptyState.svelte';
	import Flash from '$components/admin/Flash.svelte';
	import PageHeader from '$components/admin/PageHeader.svelte';
	import Panel from '$components/admin/Panel.svelte';
	import { can } from '$lib/shared/permissions';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const editable = $derived(can(data.user, 'survey.write'));

	/** La carte dont la modification a echoue : son formulaire reste ouvert. */
	const failedCard = $derived(form && 'cardId' in form ? form.cardId : null);

	const field =
		'border-ink/20 bg-paper rounded-field min-h-11 w-full min-w-0 border px-3 py-2 text-sm';
	const secondary =
		'border-ink/25 bg-paper press rounded-pill inline-flex min-h-11 items-center justify-center border px-4 py-2 text-sm font-semibold';

	type Values = {
		title: string;
		comment: string | null;
		chart: string;
		xCode: string;
		yCode: string | null;
		filters: readonly string[];
	};

	const EMPTY: Values = {
		title: '',
		comment: null,
		chart: '',
		xCode: '',
		yCode: null,
		filters: []
	};
</script>

<svelte:head><title>Sélection, {data.survey.title} | Back-office</title></svelte:head>

<PageHeader
	title="Sélection de l'équipe"
	breadcrumb={[
		{ label: 'Sondages', href: '/admin/sondages' },
		{ label: data.survey.title, href: `/admin/sondages/${data.survey.id}` }
	]}
	description="Les croisements que l'équipe met en avant, sur la fiche de l'enquête et sur l'accueil. Chaque carte ouvre l'explorateur public : elle ne fige aucun chiffre."
/>

<Flash message={form?.message} />

{#if data.survey.status !== 'PUBLISHED'}
	<p class="text-muted mb-5 text-sm">
		L'enquête n'est pas publiée : même publiés, ces croisements ne s'afficheront qu'à sa
		publication.
	</p>
{/if}

<!--
	Le formulaire d une carte, le meme pour ajouter et pour modifier : une
	liste de filtres par filtre deja pose, plus une vide pour en ajouter un.
-->
{#snippet cardFields(values: Values, prefix: string)}
	<div class="grid gap-4 sm:grid-cols-2">
		<label class="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
			<span class="text-sm font-semibold">Titre</span>
			<input
				name="title"
				required
				maxlength={data.limits.title}
				value={values.title}
				placeholder="Ce que le croisement montre, en une phrase"
				class={field}
			/>
		</label>
		<label class="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
			<span class="text-sm font-semibold">Commentaire de l'équipe</span>
			<textarea name="comment" rows="3" maxlength={data.limits.comment} class={field}
				>{values.comment ?? ''}</textarea
			>
			<span class="text-muted text-xs">
				Facultatif, {data.limits.comment} caractères au plus. Dites ce qu'il faut regarder, sans citer
				de chiffre : celui du moment s'affichera à l'ouverture.
			</span>
		</label>
		<label class="flex min-w-0 flex-col gap-1.5">
			<span class="text-sm font-semibold">Question</span>
			<select name="x" required value={values.xCode} class={field}>
				<option value="" disabled>Choisir une question</option>
				{#each data.questions as question (question.code)}
					<option value={question.code}>{question.label}</option>
				{/each}
			</select>
		</label>
		<label class="flex min-w-0 flex-col gap-1.5">
			<span class="text-sm font-semibold">Croisée avec</span>
			<select name="y" value={values.yCode ?? ''} class={field}>
				<option value="">Aucun croisement</option>
				{#each data.questions as question (question.code)}
					<option value={question.code}>{question.label}</option>
				{/each}
			</select>
		</label>
		<label class="flex min-w-0 flex-col gap-1.5">
			<span class="text-sm font-semibold">Graphique</span>
			<select name="chart" value={values.chart} class={field}>
				<option value="">Celui par défaut</option>
				<optgroup label="Question seule">
					{#each data.charts.distribution as chart (chart.key)}
						<option value={chart.key}>{chart.label}</option>
					{/each}
				</optgroup>
				<optgroup label="Avec un croisement">
					{#each data.charts.crosstab as chart (chart.key)}
						<option value={chart.key}>{chart.label}</option>
					{/each}
				</optgroup>
			</select>
			<span class="text-muted text-xs"
				>Un graphique qui ne va pas avec le croisement est remplacé par celui par défaut.</span
			>
		</label>
		<div class="flex min-w-0 flex-col gap-1.5">
			{#each [...values.filters, ''] as filter, index (`${prefix}-${index}`)}
				<label class="flex min-w-0 flex-col gap-1.5">
					<span class="text-sm font-semibold">
						{index === 0 ? 'Restreindre à' : 'Et à'}
					</span>
					<select name="filtre" value={filter} class={field}>
						<option value="">{index === 0 ? 'Tous les répondants' : 'Aucun autre filtre'}</option>
						{#each data.filterChoices as group (group.label)}
							<optgroup label={group.label}>
								{#each group.options as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</optgroup>
						{/each}
					</select>
				</label>
			{/each}
		</div>
	</div>
{/snippet}

<div class="flex flex-col gap-6">
	<Panel
		title="Les croisements choisis"
		description="Dans l'ordre d'affichage. La fiche de l'enquête les montre tous ; l'accueil montre les premiers publiés."
	>
		{#if data.cards.length === 0}
			<EmptyState
				title="Aucun croisement choisi"
				description={editable
					? 'Ajoutez-en un avec le formulaire ci-dessous : il restera hors ligne jusqu’à sa publication.'
					: 'L’équipe n’a encore mis aucun croisement en avant pour cette enquête.'}
			/>
		{:else}
			<ol class="flex flex-col gap-4">
				{#each data.cards as card, index (card.id)}
					<li class="border-ink/12 rounded-panel border p-4 sm:p-5">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<p class="text-muted text-xs font-semibold">
									{card.isPublished ? 'Publié' : 'Hors ligne'}
								</p>
								<h3 class="mt-1 font-semibold">{card.title}</h3>
								{#if card.described}
									<p class="text-muted mt-1 text-sm">
										{card.described.question}{card.described.crossedWith
											? `, croisée avec ${card.described.crossedWith}`
											: ''}{card.described.filters.length > 0
											? `, parmi ${card.described.filters.join(' et ')}`
											: ''}.
									</p>
								{:else}
									<p class="text-danger mt-1 text-sm">
										Une question ou une réponse de ce croisement n'existe plus : il ne s'affiche pas
										sur le site. Modifiez-le ou supprimez-le.
									</p>
								{/if}
								{#if card.comment}
									<p class="mt-2 text-sm leading-relaxed">{card.comment}</p>
								{/if}
							</div>
							<a href={card.previewUrl} target="_blank" rel="noopener" class={secondary}>
								Voir dans l'explorateur
							</a>
						</div>

						{#if editable}
							<div class="mt-4 flex flex-wrap gap-2">
								<form method="POST" action="?/publish" use:enhance>
									<input type="hidden" name="cardId" value={card.id} />
									<input type="hidden" name="publish" value={card.isPublished ? 'false' : 'true'} />
									<button
										type="submit"
										disabled={!card.isPublished && !card.described}
										class="{card.isPublished
											? secondary
											: 'bg-ink text-paper press rounded-pill inline-flex min-h-11 items-center justify-center px-4 py-2 text-sm font-semibold'} disabled:opacity-40"
									>
										{card.isPublished ? 'Retirer du site' : 'Publier'}
									</button>
								</form>
								<form method="POST" action="?/move" use:enhance>
									<input type="hidden" name="cardId" value={card.id} />
									<input type="hidden" name="direction" value="up" />
									<button
										type="submit"
										disabled={index === 0}
										aria-label="Monter « {card.title} »"
										class="{secondary} disabled:opacity-30">Monter</button
									>
								</form>
								<form method="POST" action="?/move" use:enhance>
									<input type="hidden" name="cardId" value={card.id} />
									<input type="hidden" name="direction" value="down" />
									<button
										type="submit"
										disabled={index === data.cards.length - 1}
										aria-label="Descendre « {card.title} »"
										class="{secondary} disabled:opacity-30">Descendre</button
									>
								</form>
								<form method="POST" action="?/delete" use:enhance>
									<input type="hidden" name="cardId" value={card.id} />
									<button
										type="submit"
										aria-label="Supprimer « {card.title} »"
										class="{secondary} text-danger">Supprimer</button
									>
								</form>
							</div>

							<details class="mt-4" open={failedCard === card.id}>
								<summary
									class="text-coral-ink inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold"
								>
									Modifier
								</summary>
								<form method="POST" action="?/update" use:enhance class="mt-3 flex flex-col gap-4">
									<input type="hidden" name="cardId" value={card.id} />
									{@render cardFields(card, card.id)}
									<div>
										<button
											type="submit"
											class="bg-ink text-paper press rounded-pill inline-flex min-h-11 items-center px-5 py-2 text-sm font-semibold"
										>
											Enregistrer
										</button>
									</div>
								</form>
							</details>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
	</Panel>

	{#if editable}
		<Panel
			title="Ajouter un croisement"
			description="Le croisement arrive hors ligne, en dernier. Vérifiez-le dans l'explorateur avant de le publier."
		>
			{#if data.questions.length === 0}
				<p class="text-muted text-sm">
					Aucune question croisable dans cette enquête : rendez-en une croisable depuis la fiche du
					sondage.
				</p>
			{:else}
				<form method="POST" action="?/create" use:enhance class="flex flex-col gap-4">
					{@render cardFields(EMPTY, 'new')}
					<div>
						<button
							type="submit"
							class="bg-ink text-paper press rounded-pill inline-flex min-h-11 items-center px-5 py-2 text-sm font-semibold"
						>
							Ajouter à la sélection
						</button>
					</div>
				</form>
			{/if}
		</Panel>
	{/if}
</div>
