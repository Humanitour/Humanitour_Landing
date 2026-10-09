<script lang="ts">
	import { enhance } from '$app/forms';
	import Dialog from '$components/admin/Dialog.svelte';
	import Flash from '$components/admin/Flash.svelte';
	import PageHeader from '$components/admin/PageHeader.svelte';
	import Panel from '$components/admin/Panel.svelte';
	import StatusBadge from '$components/admin/StatusBadge.svelte';
	import { formatCount } from '$lib/shared/format';
	import { can } from '$lib/shared/permissions';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const editable = $derived(can(data.user, 'survey.write'));

	/** Une date ISO vers la valeur attendue par un champ `date`. */
	function dateValue(value: Date | null): string {
		return value ? new Date(value).toISOString().slice(0, 10) : '';
	}

	/**
	 * Question dont la suppression attend confirmation. Seules celles qui
	 * portent des reponses passent par la fenetre : les autres n'emportent rien.
	 */
	let pendingDelete = $state<{ id: string; code: string; label: string; answers: number } | null>(
		null
	);
	let deleteConfirm = $state('');

	const typeLabel = $derived(
		(key: string) => data.questionTypes.find((type) => type.key === key)?.label ?? key
	);
</script>

<svelte:head><title>{data.survey.title} — Back-office</title></svelte:head>

<PageHeader
	title={data.survey.title}
	breadcrumb={[{ label: 'Sondages', href: '/admin/sondages' }]}
	description="Adresse publique : /donnees/{data.survey.slug}"
>
	{#snippet actions()}
		<StatusBadge status={data.survey.status} />
		{#if can(data.user, 'survey.sync')}
			<a
				href="/admin/sondages/{data.survey.id}/openforms"
				class="bg-ink text-paper press rounded-pill px-4 py-2 text-sm font-semibold min-h-11 inline-flex items-center justify-center"
			>
				Collecte Openforms
			</a>
		{/if}
		{#if can(data.user, 'survey.read')}
			<a
				href="/admin/sondages/{data.survey.id}/reponses"
				class="border-ink/25 bg-paper press rounded-pill inline-flex min-h-11 items-center justify-center border px-4 py-2 text-sm font-semibold"
			>
				Réponses
			</a>
			<a
				href="/admin/sondages/{data.survey.id}/selection"
				class="border-ink/25 bg-paper press rounded-pill inline-flex min-h-11 items-center justify-center border px-4 py-2 text-sm font-semibold"
			>
				Sélection
			</a>
			<a
				href="/admin/sondages/{data.survey.id}/redressement"
				class="border-ink/25 bg-paper press rounded-pill inline-flex min-h-11 items-center justify-center border px-4 py-2 text-sm font-semibold"
			>
				Redressement
			</a>
		{/if}
	{/snippet}
</PageHeader>

<Flash message={form?.message} />

<div class="grid gap-6 lg:grid-cols-[1fr_20rem]">
	<div class="flex flex-col gap-6">
		<Panel
			title="Questionnaire"
			description="L'ordre ci-dessous est celui des questions sur la page publique."
		>
			{#if data.questions.length === 0}
				<p class="text-muted text-sm">
					Aucune question. Ajoutez-en une ci-dessous : le code sera deduit du libelle et entrera
					dans les permaliens de croisement.
				</p>
			{:else}
				<ul class="flex flex-col gap-2">
					{#each data.questions as question, index (question.id)}
						<li class="border-ink/20 rounded-field border p-3">
							<div class="flex flex-wrap items-start justify-between gap-3">
								<div class="min-w-0">
									<p class="font-medium">{question.label}</p>
									<p class="text-muted mt-0.5 text-xs">
										<code class="bg-cream rounded px-1.5 py-0.5">{question.code}</code>
										<span class="ml-2">{typeLabel(question.type)}</span>
										{#if question.optionCount > 0}
											<span class="ml-2">{question.optionCount} modalites</span>
										{/if}
										<span class="ml-2">{formatCount(question.answerCount)} réponse(s)</span>
										{#if !question.isCrossable}
											<span class="text-warning ml-2">non croisable</span>
										{/if}
									</p>
								</div>

								{#if editable}
									<div class="flex shrink-0 flex-wrap gap-1.5">
										<a
											href="/admin/sondages/{data.survey.id}/questions/{question.id}"
											class="border-ink/25 bg-paper rounded-pill border px-2.5 py-1 text-xs min-h-11 inline-flex items-center justify-center"
										>
											Modifier
										</a>
										<form method="POST" action="?/moveQuestion" use:enhance>
											<input type="hidden" name="questionId" value={question.id} />
											<input type="hidden" name="direction" value="up" />
											<button
												type="submit"
												disabled={index === 0}
												class="border-ink/25 bg-paper rounded-pill border px-2.5 py-1 text-xs disabled:opacity-30 min-h-11 inline-flex items-center justify-center"
												aria-label="Monter « {question.label} »"
											>
												↑
											</button>
										</form>
										<form method="POST" action="?/moveQuestion" use:enhance>
											<input type="hidden" name="questionId" value={question.id} />
											<input type="hidden" name="direction" value="down" />
											<button
												type="submit"
												disabled={index === data.questions.length - 1}
												class="border-ink/25 bg-paper rounded-pill border px-2.5 py-1 text-xs disabled:opacity-30 min-h-11 inline-flex items-center justify-center"
												aria-label="Descendre « {question.label} »"
											>
												↓
											</button>
										</form>
										{#if question.answerCount > 0}
											<button
												type="button"
												onclick={() => {
													deleteConfirm = '';
													pendingDelete = {
														id: question.id,
														code: question.code,
														label: question.label,
														answers: question.answerCount
													};
												}}
												class="border-ink/25 text-danger bg-paper rounded-pill border px-2.5 py-1 text-xs min-h-11 inline-flex items-center justify-center"
											>
												Supprimer
											</button>
										{:else}
											<form method="POST" action="?/deleteQuestion" use:enhance>
												<input type="hidden" name="questionId" value={question.id} />
												<button
													type="submit"
													class="border-ink/25 text-danger bg-paper rounded-pill border px-2.5 py-1 text-xs min-h-11 inline-flex items-center justify-center"
												>
													Supprimer
												</button>
											</form>
										{/if}
									</div>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}

			{#snippet footer()}
				{#if editable}
					<form
						method="POST"
						action="?/addQuestion"
						use:enhance
						class="flex flex-wrap items-end gap-2"
					>
						<label class="flex min-w-56 flex-1 flex-col gap-1">
							<span class="text-xs font-semibold">Libelle de la nouvelle question</span>
							<input
								name="label"
								required
								minlength="3"
								placeholder="Quelle est votre priorité pour la France ?"
								class="border-ink/20 bg-paper rounded-field border px-3 py-2 text-sm min-h-11"
							/>
						</label>
						<label class="flex flex-col gap-1">
							<span class="text-xs font-semibold">Type</span>
							<select
								name="type"
								class="border-ink/20 bg-paper rounded-field border px-3 py-2 text-sm min-h-11"
							>
								{#each data.questionTypes as type (type.key)}
									<option value={type.key}>{type.label}</option>
								{/each}
							</select>
						</label>
						<button
							type="submit"
							class="bg-ink text-paper press rounded-pill px-4 py-2 text-sm font-semibold min-h-11 inline-flex items-center justify-center"
						>
							Ajouter
						</button>
					</form>
				{/if}
			{/snippet}
		</Panel>

		<Panel
			title="Méthodologie"
			description="Obligatoire avant publication. C'est ce qui distingue cette enquête d'un sondage opaque."
		>
			<form method="POST" action="?/metadata" use:enhance class="flex flex-col gap-4">
				<div class="grid gap-4 sm:grid-cols-2">
					<label class="flex flex-col gap-1.5 sm:col-span-2">
						<span class="text-sm font-semibold">Titre</span>
						<input
							name="title"
							required
							value={data.survey.title}
							disabled={!editable}
							class="border-ink/20 bg-paper rounded-field border px-3 py-2 min-h-11"
						/>
					</label>

					<label class="flex flex-col gap-1.5 sm:col-span-2">
						<span class="text-sm font-semibold">Sous-titre</span>
						<input
							name="subtitle"
							value={data.survey.subtitle ?? ''}
							disabled={!editable}
							class="border-ink/20 bg-paper rounded-field border px-3 py-2 min-h-11"
						/>
					</label>

					<label class="flex flex-col gap-1.5">
						<span class="text-sm font-semibold">Debut du terrain</span>
						<input
							type="date"
							name="fieldworkStart"
							value={dateValue(data.survey.fieldworkStart)}
							disabled={!editable}
							class="border-ink/20 bg-paper rounded-field border px-3 py-2 min-h-11"
						/>
					</label>

					<label class="flex flex-col gap-1.5">
						<span class="text-sm font-semibold">Fin du terrain</span>
						<input
							type="date"
							name="fieldworkEnd"
							value={dateValue(data.survey.fieldworkEnd)}
							disabled={!editable}
							class="border-ink/20 bg-paper rounded-field border px-3 py-2 min-h-11"
						/>
					</label>
				</div>

				<label class="flex flex-col gap-1.5">
					<span class="text-sm font-semibold">Presentation</span>
					<textarea
						name="description"
						rows="3"
						disabled={!editable}
						class="border-ink/20 bg-paper rounded-field border px-3 py-2 min-h-11"
						>{data.survey.description ?? ''}</textarea
					>
				</label>

				<label class="flex flex-col gap-1.5">
					<span class="text-sm font-semibold">
						Méthodologie <span class="text-danger">*</span>
					</span>
					<span class="text-muted text-xs">
						Mode de collecte, construction de l'echantillon, limites connues. Publiee telle quelle.
					</span>
					<textarea
						name="methodology"
						rows="8"
						disabled={!editable}
						class="border-ink/20 bg-paper rounded-field border px-3 py-2 min-h-11"
						>{data.survey.methodology ?? ''}</textarea
					>
				</label>

				<label class="flex flex-col gap-1.5">
					<span class="text-sm font-semibold">Seuil d'anonymat propre à cette enquete</span>
					<span class="text-muted text-xs">
						Laissez vide pour appliquer le reglage global. Ne le baissez que si vous savez ce que
						vous faites.
					</span>
					<input
						type="number"
						name="kAnonymityThreshold"
						min="1"
						value={data.survey.kAnonymityThreshold ?? ''}
						disabled={!editable}
						class="border-ink/20 bg-paper w-32 rounded-field border px-3 py-2 min-h-11"
					/>
				</label>

				<!--
					La fiche du jeu de donnees.

					Ce qu'un reutilisateur doit savoir AVANT de telecharger : sur qui
					porte l'enquete, comment elle a ete collectee, si elle sera mise a
					jour. Tout y est facultatif, et ce qui reste vide ne s'affiche pas
					sur la fiche publique plutot que d'y laisser une ligne vide.
				-->
				<fieldset class="border-ink/12 flex flex-col gap-4 border-t pt-5">
					<legend class="sr-only">Fiche du jeu de données</legend>
					<h3 class="text-base font-semibold">Fiche du jeu de données</h3>

					<label class="flex flex-col gap-1.5">
						<span class="text-sm font-semibold">Thèmes et mots-clés</span>
						<span class="text-muted text-xs">
							Séparés par des virgules. Ils deviennent filtrables dans le catalogue public.
						</span>
						<input
							name="keywords"
							value={data.survey.keywords.join(', ')}
							placeholder="pouvoir d'achat, logement, abstention"
							disabled={!editable}
							class="border-ink/20 bg-paper rounded-field min-h-11 border px-3 py-2"
						/>
					</label>

					<div class="grid gap-4 sm:grid-cols-2">
						<label class="flex flex-col gap-1.5">
							<span class="text-sm font-semibold">Couverture géographique</span>
							<input
								name="geographicCoverage"
								value={data.survey.geographicCoverage ?? ''}
								placeholder="France métropolitaine, treize régions"
								disabled={!editable}
								class="border-ink/20 bg-paper rounded-field min-h-11 border px-3 py-2"
							/>
						</label>

						<label class="flex flex-col gap-1.5">
							<span class="text-sm font-semibold">Mode de collecte</span>
							<input
								name="collectionMode"
								value={data.survey.collectionMode ?? ''}
								placeholder="Face-à-face sur le terrain"
								disabled={!editable}
								class="border-ink/20 bg-paper rounded-field min-h-11 border px-3 py-2"
							/>
						</label>
					</div>

					<label class="flex flex-col gap-1.5">
						<span class="text-sm font-semibold">Fréquence de mise à jour</span>
						<span class="text-muted text-xs">
							Dire « enquête ponctuelle, pas de mise à jour prévue » vaut mieux que ne rien dire :
							le silence laisse croire que le jeu est abandonné.
						</span>
						<input
							name="updateFrequency"
							value={data.survey.updateFrequency ?? ''}
							placeholder="Enquête ponctuelle, pas de mise à jour prévue"
							disabled={!editable}
							class="border-ink/20 bg-paper rounded-field min-h-11 border px-3 py-2"
						/>
					</label>
				</fieldset>

				<!--
					Referencement et partage. Facultatif : a defaut, la page se rabat
					sur le titre et le sous-titre, qui sont deja ecrits pour etre lus.
				-->
				<fieldset class="border-ink/12 flex flex-col gap-4 border-t pt-5">
					<legend class="sr-only">Référencement et partage</legend>
					<h3 class="text-base font-semibold">Référencement et partage</h3>

					<label class="flex flex-col gap-1.5">
						<span class="text-sm font-semibold">Titre de référencement</span>
						<span class="text-muted text-xs">
							Laissez vide pour reprendre le titre de l'enquête.
						</span>
						<input
							name="metaTitle"
							value={data.survey.metaTitle ?? ''}
							disabled={!editable}
							class="border-ink/20 bg-paper rounded-field min-h-11 border px-3 py-2"
						/>
					</label>

					<label class="flex flex-col gap-1.5">
						<span class="text-sm font-semibold">Description de partage</span>
						<span class="text-muted text-xs">
							Ce qui s'affiche sous le lien sur les réseaux et dans les moteurs. À défaut, le
							sous-titre sert.
						</span>
						<textarea
							name="metaDescription"
							rows="3"
							disabled={!editable}
							class="border-ink/20 bg-paper rounded-field min-h-11 border px-3 py-2"
							>{data.survey.metaDescription ?? ''}</textarea
						>
					</label>
				</fieldset>

				{#if editable}
					<div>
						<button
							type="submit"
							class="bg-ink text-paper press rounded-pill px-5 py-2.5 text-sm font-semibold min-h-11 inline-flex items-center justify-center"
						>
							Enregistrer
						</button>
					</div>
				{/if}
			</form>
		</Panel>
	</div>

	<aside class="flex flex-col gap-6">
		<Panel title="État">
			<dl class="flex flex-col gap-3 text-sm">
				<div class="flex justify-between gap-3">
					<dt class="text-muted">Réponses</dt>
					<dd class="tabular font-semibold">{formatCount(data.survey.responseCount)}</dd>
				</div>
				<div class="flex justify-between gap-3">
					<dt class="text-muted">Questions</dt>
					<dd class="tabular font-semibold">{formatCount(data.questions.length)}</dd>
				</div>
				<div class="flex justify-between gap-3">
					<dt class="text-muted">Méthodologie</dt>
					<dd class="font-semibold">
						{data.survey.methodology?.trim() ? 'Renseignee' : 'Manquante'}
					</dd>
				</div>
			</dl>

			{#if data.survey.status === 'PUBLISHED'}
				<a
					href="/donnees/{data.survey.slug}"
					class="text-coral-ink mt-4 inline-block text-sm underline"
				>
					Voir la page publique
				</a>
			{/if}
		</Panel>
	</aside>
</div>

<Dialog
	open={pendingDelete !== null}
	title="Supprimer une question et ses réponses"
	onClose={() => (pendingDelete = null)}
>
	{#if pendingDelete}
		<form
			method="POST"
			action="?/deleteQuestion"
			use:enhance={() => {
				return async ({ update }) => {
					pendingDelete = null;
					await update();
				};
			}}
			class="flex flex-col gap-4"
		>
			<input type="hidden" name="questionId" value={pendingDelete.id} />
			<p>
				« {pendingDelete.label} » porte {formatCount(pendingDelete.answers)} réponse(s). Elles seront
				effacées de ce site ; Openforms les garde. Si la question vient du formulaire, son champ sera
				écarté et ne reviendra pas à la prochaine reprise.
			</p>

			<label class="flex flex-col gap-1.5">
				<span class="font-semibold">Recopiez le code de la question pour confirmer</span>
				<code class="bg-cream w-fit rounded px-1.5 py-0.5 text-xs">{pendingDelete.code}</code>
				<input
					name="confirm"
					bind:value={deleteConfirm}
					autocomplete="off"
					spellcheck="false"
					class="border-ink/20 bg-paper rounded-field min-h-11 border px-3 py-2"
				/>
			</label>

			<div class="border-ink/12 flex justify-end gap-2 border-t pt-4">
				<button
					type="button"
					onclick={() => (pendingDelete = null)}
					class="border-ink/25 press bg-paper rounded-pill inline-flex min-h-11 items-center border px-4 py-2 text-sm font-medium"
				>
					Annuler
				</button>
				<button
					type="submit"
					disabled={deleteConfirm.trim() !== pendingDelete.code}
					class="bg-ink text-paper press rounded-pill inline-flex min-h-11 items-center px-4 py-2 text-sm font-semibold disabled:opacity-40"
				>
					Supprimer la question
				</button>
			</div>
		</form>
	{/if}
</Dialog>
