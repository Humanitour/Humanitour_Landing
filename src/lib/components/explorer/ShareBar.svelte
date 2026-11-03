<script lang="ts">
	import { onMount } from 'svelte';
	import type { CodeExample } from '$shared/citation';
	import { LICENSES } from '$shared/site';
	import { POSTER_QUALITIES, type PosterQuality } from '$lib/poster';

	/**
	 * Citer, telecharger, rejouer.
	 *
	 * C est le bloc qu Our World in Data place sous chaque graphique, et c est ce
	 * qui separe un site qui affiche des chiffres d un site qu on peut CITER.
	 * Sans citation prete a coller, un journaliste recopie a la main : il perd la
	 * base, il perd la formulation exacte de la question, et le chiffre circule
	 * sans ce qui permettait de le verifier.
	 *
	 * Tout est visible et selectionnable sans JavaScript. Le bouton « copier »,
	 * lui, n apparait qu une fois le presse-papier disponible : une commande qui
	 * ne peut rien faire ne doit pas exister.
	 */
	interface Props {
		shortCitation: string;
		longCitation: string;
		codeExamples: readonly CodeExample[];
		csvUrl: string;
		/** Le meme resultat en tableau (ligne x colonne). Absent pour un decoupage. */
		tableUrl?: string | null;
		apiUrl: string;
		pageUrl: string;
		/**
		 * Compose l affiche PNG, a la qualite demandee. Absent quand il n y a pas
		 * de graphique a exporter : un tableau croise n est pas une image.
		 */
		downloadImage: ((quality: PosterQuality) => Promise<void>) | null;
	}

	let {
		shortCitation,
		longCitation,
		codeExamples,
		csvUrl,
		tableUrl = null,
		apiUrl,
		pageUrl,
		downloadImage
	}: Props = $props();

	/** Vrai une fois la page reprise par le navigateur. */
	let interactive = $state(false);
	/** L affiche est en cours de composition : elle demande un rendu hors ecran. */
	let composing = $state(false);
	let imageError = $state('');
	/** La qualite choisie pour le prochain export : ecran par defaut, l impression se demande. */
	let quality = $state<PosterQuality>('ecran');

	async function onImage(): Promise<void> {
		if (!downloadImage || composing) return;

		composing = true;
		imageError = '';
		try {
			await downloadImage(quality);
		} catch {
			imageError = "L'image n'a pas pu être composée. Le téléchargement en CSV reste disponible.";
		} finally {
			composing = false;
		}
	}

	let canCopy = $state(false);
	/** Ce qui vient d etre copie, pour le dire a l utilisateur. */
	let copied = $state('');

	onMount(() => {
		interactive = true;
		canCopy = typeof navigator !== 'undefined' && Boolean(navigator.clipboard);
	});

	async function copy(label: string, value: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(value);
			copied = label;
		} catch {
			// Presse-papier refuse par le navigateur : le texte reste affiche et
			// selectionnable, donc rien n est perdu. Le dire vaut mieux que de
			// laisser croire que la copie a eu lieu.
			copied = '';
		}
	}
</script>

<div class="border-ink/12 mt-6 border-t pt-6">
	<div class="flex flex-wrap items-center gap-3">
		<!--
			`data-sveltekit-reload` et `download` : sans eux, le routeur traite ce
			lien comme une navigation, la page passe en « calcul en cours », puis
			le navigateur telecharge le fichier au lieu de changer de page. La
			navigation ne se terminait donc jamais et le graphique restait grise.
		-->
		<a
			href={csvUrl}
			data-sveltekit-reload
			download
			class="bg-ink text-paper press rounded-pill inline-flex min-h-11 items-center px-5 py-2.5 text-sm font-semibold"
		>
			Télécharger ce croisement
		</a>
		{#if tableUrl}
			<a
				href={tableUrl}
				data-sveltekit-reload
				download
				class="border-ink/25 bg-paper press rounded-pill inline-flex min-h-11 items-center border px-5 py-2.5 text-sm font-semibold"
			>
				Tableau (CSV)
			</a>
		{/if}
		{#if interactive && downloadImage}
			<!--
				L affiche emporte la question exacte, la base, le terrain et la
				licence : une image de graphique qui circule sans eux ne peut pas
				etre verifiee. Elle est composee dans le navigateur, donc le bouton
				n apparait qu une fois celui-ci aux commandes.
			-->
			<button
				type="button"
				onclick={onImage}
				disabled={composing}
				class="border-ink/25 press bg-paper rounded-pill inline-flex min-h-11 items-center border px-5 py-2.5 text-sm font-medium disabled:opacity-50"
			>
				{composing ? 'Composition…' : "Télécharger l'image"}
			</button>
			<!--
				Ecran suffit a un partage ; l impression grandit le graphique et le
				canvas final (`poster.ts`), donc le fichier pese plus lourd. Le choix
				reste a cote du bouton plutot que dans un reglage cache : c est la
				seule decision que ce telechargement demande.
			-->
			<label class="text-muted flex min-h-11 items-center gap-2 text-sm">
				<span class="sr-only">Qualité de l'image</span>
				<select
					bind:value={quality}
					disabled={composing}
					class="border-ink/25 rounded-field bg-paper min-h-11 border px-3 py-2 text-sm disabled:opacity-50"
				>
					{#each Object.entries(POSTER_QUALITIES) as [value, { label }] (value)}
						<option {value}>{label}</option>
					{/each}
				</select>
			</label>
		{/if}
		{#if canCopy}
			<button
				type="button"
				onclick={() => copy('lien', pageUrl)}
				class="border-ink/25 press bg-paper rounded-pill inline-flex min-h-11 items-center border px-5 py-2.5 text-sm font-medium"
			>
				Copier le lien
			</button>
			<button
				type="button"
				onclick={() => copy('citation', shortCitation)}
				class="border-ink/25 press bg-paper rounded-pill inline-flex min-h-11 items-center border px-5 py-2.5 text-sm font-medium"
			>
				Copier la citation
			</button>
		{/if}
		<a
			href={apiUrl}
			data-sveltekit-reload
			class="text-muted hover:text-ink inline-flex min-h-11 items-center text-sm underline decoration-2 underline-offset-2"
		>
			Voir la réponse de l'API
		</a>
	</div>

	<!-- `role="status"` : le retour de copie est annonce aux lecteurs d ecran,
	     qui ne voient pas le texte apparaitre. -->
	<p class="text-muted mt-3 min-h-5 text-sm" role="status">
		{#if imageError}{imageError}{:else if copied === 'lien'}Lien copié.{:else if copied === 'citation'}Citation
			copiée.{/if}
	</p>

	<details class="border-ink/12 rounded-field mt-2 border">
		<summary class="flex min-h-11 cursor-pointer items-center px-4 py-2.5 text-sm font-semibold">
			Citer ce résultat
		</summary>
		<div class="flex flex-col gap-4 px-4 pt-1 pb-4">
			<div>
				<h4 class="text-sm font-semibold">Citation courte</h4>
				<p class="border-ink/12 bg-cream rounded-field mt-2 border p-3 text-sm select-all">
					{shortCitation}
				</p>
			</div>
			<div>
				<h4 class="text-sm font-semibold">Citation complète</h4>
				<p
					class="border-ink/12 bg-cream rounded-field mt-2 border p-3 text-sm leading-relaxed select-all"
				>
					{longCitation}
				</p>
				<p class="text-muted mt-2 text-xs">
					Elle porte le libellé exact de la question : la formulation fait partie du résultat.
				</p>
			</div>
		</div>
	</details>

	<details class="border-ink/12 rounded-field mt-2 border">
		<summary class="flex min-h-11 cursor-pointer items-center px-4 py-2.5 text-sm font-semibold">
			Rejouer ce croisement en code
		</summary>
		<div class="flex flex-col gap-4 px-4 pt-1 pb-4">
			<p class="text-muted text-sm leading-relaxed">
				Ces exemples interrogent l'API publique sur l'adresse exacte affichée ici : ce que vous
				lisez à l'écran et ce que vous chargez dans votre carnet sont le même comptage.
			</p>
			{#each codeExamples as example (example.key)}
				<div>
					<div class="flex items-center justify-between gap-3">
						<h4 class="text-sm font-semibold">{example.label}</h4>
						{#if canCopy}
							<button
								type="button"
								onclick={() => copy(example.key, example.code)}
								class="text-muted hover:text-ink text-xs underline decoration-2 underline-offset-2"
							>
								Copier
							</button>
						{/if}
					</div>
					<pre
						class="border-ink/12 bg-cream rounded-field mt-2 overflow-x-auto border p-3 text-xs leading-relaxed"><code
							>{example.code}</code
						></pre>
				</div>
			{/each}
		</div>
	</details>

	<p class="text-muted mt-3 text-xs">
		Données diffusées sous
		<a
			class="underline decoration-2 underline-offset-2"
			href={LICENSES.data.url}
			target="_blank"
			rel="noopener noreferrer">{LICENSES.data.name}</a
		>. Citez Humanitour et rouvrez vos dérivés.
	</p>
</div>
