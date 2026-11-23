<script lang="ts">
	import type { ActionResult } from '@sveltejs/kit';
	import { enhance } from '$app/forms';
	import { SPACING_KEYS, SURFACE_KEYS } from '$lib/shared/content/blocks/common';
	import { SITE } from '$lib/shared/site';
	import { getContentContext } from './context';
	import Marked from './Marked.svelte';
	import { sectionReader } from './read';
	import Section from './Section.svelte';

	interface Props {
		id: string;
		data: Readonly<Record<string, unknown>>;
	}

	let { id, data }: Props = $props();

	const page = getContentContext();
	const read = $derived(sectionReader(data, page.tokens));

	const surface = $derived(read.choice('surface', SURFACE_KEYS, 'paper'));
	const spacing = $derived(read.choice('spacing', SPACING_KEYS, 'ample'));
	const intro = $derived(read.text('intro'));

	let submitted = $state(false);
	let pending = $state(false);
	let errorMessage = $state<string | null>(null);

	/*
	 * Le formulaire poste vers l'action de `/infolettre` : meme frein par IP,
	 * meme consentement, meme ecriture en base (voir `blocks/newsletter.ts`).
	 * Une reussite y redirige normalement vers `/infolettre?inscrit` ; ici, on
	 * affiche la confirmation sur place plutot que de faire quitter l'accueil.
	 */
	function onSubmit() {
		pending = true;
		errorMessage = null;
		return async ({ result }: { result: ActionResult }) => {
			pending = false;
			if (result.type === 'redirect') {
				submitted = true;
				return;
			}
			if (result.type === 'failure') {
				const failure = result.data as { message?: string } | undefined;
				errorMessage = failure?.message ?? 'Inscription refusée.';
				return;
			}
			if (result.type === 'error') {
				errorMessage = 'Une erreur est survenue. Réessayez plus tard.';
			}
		};
	}

	const field = 'field-tactile rounded-field min-h-11 px-3 py-2.5';
</script>

<Section {surface} {spacing} labelledby={id}>
	<div class="measure">
		<h2 {id} class="text-3xl sm:text-5xl" data-field="title">
			<Marked
				text={read.text('title') ?? ''}
				highlight={read.text('highlight')}
				style={read.raw('highlightStyle') ?? 'brand'}
			/>
		</h2>

		{#if intro}
			<p class="mt-5 text-xl font-medium" data-field="intro">{intro}</p>
		{/if}

		{#if submitted}
			<p
				class="border-ink/20 bg-cream rounded-panel mt-8 border px-5 py-4 text-lg leading-relaxed"
			>
				<strong class="font-semibold">C'est noté.</strong>
				Vous recevrez un message quand les résultats et la série documentaire seront publiés, et
				rien d'autre.
			</p>
		{:else}
			<form
				method="POST"
				action="/infolettre"
				use:enhance={onSubmit}
				class="mt-8 flex flex-col gap-4"
			>
				{#if errorMessage}
					<p
						role="alert"
						class="border-danger/40 bg-danger/10 text-danger rounded-field border px-4 py-3"
					>
						<strong class="font-semibold">Inscription refusée.</strong>
						{errorMessage}
					</p>
				{/if}

				<div class="flex flex-col gap-3 sm:flex-row">
					<label class="flex-1">
						<span class="mb-1.5 block text-sm font-semibold">Adresse électronique</span>
						<input
							type="email"
							name="email"
							required
							autocomplete="email"
							maxlength="254"
							class="{field} w-full"
						/>
					</label>
					<button
						type="submit"
						disabled={pending}
						class="btn-3d btn-3d-ink rounded-pill min-h-12 shrink-0 self-end px-6 py-3 font-semibold disabled:opacity-60"
					>
						{pending ? 'Envoi…' : "S'abonner"}
					</button>
				</div>

				<!-- Decochee par defaut, et l'action refuse sans elle : une case
				     pre-cochee n'est pas un consentement. -->
				<label class="flex items-start gap-3">
					<input
						type="checkbox"
						name="consentement"
						required
						class="accent-ink mt-1 size-5 shrink-0"
					/>
					<span class="text-sm leading-relaxed">
						J'accepte de recevoir l'infolettre d'{SITE.name} à cette adresse, et je sais que je
						peux me désinscrire à tout moment.
						<a href="/infolettre" class="underline decoration-2 underline-offset-2">
							En savoir plus.
						</a>
					</span>
				</label>
			</form>
		{/if}
	</div>
</Section>
