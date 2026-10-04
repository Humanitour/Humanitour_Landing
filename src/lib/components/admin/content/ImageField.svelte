<script lang="ts">
	import { tick, untrack } from 'svelte';
	import type { LibraryGroup, LibraryImage } from '$lib/shared/content/library';

	interface Props {
		/** Prefixe du champ, par exemple `data.image`. */
		name: string;
		label: string;
		help?: string;
		required: boolean;
		value: Readonly<Record<string, unknown>>;
		library: readonly LibraryGroup[];
		disabled: boolean;
	}

	let { name, label, help, required, value, library, disabled }: Props = $props();

	/**
	 * Une image se choisit de trois facons, et les trois servent.
	 *
	 * La bibliotheque d'abord : les photographies du tour et les portraits sont
	 * deja dans le depot, avec leur description ecrite et leurs dimensions
	 * relevees. Les choisir la evite de redeposer un cliche qui existe et,
	 * surtout, de le redecrire moins bien.
	 *
	 * Le televersement ensuite, pour ce qui n'existe pas encore : un bouton, ou
	 * un fichier lache sur l'apercu. Il passe par `fetch`, parce qu'un
	 * formulaire ne peut pas en contenir un autre, et l'image s'affiche avant
	 * l'enregistrement de la section.
	 *
	 * L'adresse enfin, saisie a la main, pour une image hebergee ailleurs.
	 * C'est ce champ-la qui porte la valeur : les deux autres chemins ne font
	 * que le remplir. Sans JavaScript, il reste utilisable seul, complete par
	 * la liste native des adresses connues.
	 */
	/*
	 * La valeur enregistree n'est qu'un point de depart : a partir de la, c'est
	 * la saisie en cours qui fait foi, jusqu'a l'enregistrement. `untrack` le dit
	 * explicitement — sans lui, Svelte soupconne a juste titre une prop lue une
	 * seule fois par inadvertance.
	 */
	let src = $state(untrack(() => String(value.src ?? '')));
	let alt = $state(untrack(() => String(value.alt ?? '')));
	let width = $state(untrack(() => String(value.width ?? '')));
	let height = $state(untrack(() => String(value.height ?? '')));

	const listId = $derived(`bibliotheque-${name.replace(/\W+/g, '-')}`);

	/** Le champ d'adresse : c'est par lui qu'on previent le formulaire englobant. */
	let srcInput: HTMLInputElement | undefined = $state();
	let fileInput: HTMLInputElement | undefined = $state();
	let uploading = $state(false);
	let uploadError: string | null = $state(null);
	let dragging = $state(false);

	function choose(image: LibraryImage) {
		src = image.src;
		width = image.width === undefined ? '' : String(image.width);
		height = image.height === undefined ? '' : String(image.height);
		// La description proposee ne remplace jamais celle qui a ete ecrite : on
		// ne recouvre pas le travail de quelqu'un en changeant de cliche.
		if (alt.trim() === '' && image.alt !== '') alt = image.alt;
		announce();
	}

	/**
	 * Previent le formulaire englobant qu'une valeur a change.
	 *
	 * Une valeur posee par le code n'emet aucun evenement : l'editeur de page,
	 * qui relit sa section a chaque `input`, n'aurait rien vu et l'apercu
	 * serait reste sur l'ancienne image. On attend que Svelte ait reporte les
	 * valeurs dans le DOM avant d'emettre, sinon le formulaire relirait
	 * l'ancienne adresse.
	 */
	async function announce() {
		await tick();
		srcInput?.dispatchEvent(new Event('input', { bubbles: true }));
	}

	/**
	 * Depose une image et la pose dans le champ.
	 *
	 * Par `fetch` et non par un formulaire : ce champ vit deja dans celui de
	 * sa section, et HTML n'en accepte pas un second a l'interieur.
	 */
	async function upload(file: File) {
		uploading = true;
		uploadError = null;

		const body = new FormData();
		body.set('fichier', file);

		try {
			const response = await fetch('/admin/api/televersement', { method: 'POST', body });
			const result = (await response.json().catch(() => ({}))) as {
				image?: LibraryImage;
				message?: string;
			};

			if (!response.ok || !result.image) {
				uploadError = result.message ?? 'Le téléversement a échoué. Réessayez.';
				return;
			}

			choose(result.image);
		} catch {
			uploadError = 'Le serveur est injoignable. Vérifiez la connexion et réessayez.';
		} finally {
			uploading = false;
			if (fileInput) fileInput.value = '';
		}
	}

	function onFile(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (file) void upload(file);
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		if (disabled || uploading) return;

		const file = event.dataTransfer?.files[0];
		if (file) void upload(file);
	}

	function onDragOver(event: DragEvent) {
		if (disabled) return;
		event.preventDefault();
		dragging = true;
	}

	/**
	 * Une adresse saisie a la main ne vient avec aucune dimension.
	 *
	 * Garder celles de l'image precedente serait pire que ne rien avoir : la
	 * page reserverait la mauvaise place et sauterait quand meme.
	 */
	function onSrcInput() {
		const known = library
			.flatMap((group) => group.images)
			.find((image) => image.src === src.trim());

		width = known?.width === undefined ? '' : String(known.width);
		height = known?.height === undefined ? '' : String(known.height);
	}
</script>

<fieldset class="border-ink/12 rounded-field flex flex-col gap-3 border p-4">
	<legend class="px-1 text-sm font-semibold">
		{label}
		{#if required}<span class="text-danger">*</span>{/if}
	</legend>

	{#if help}<p class="text-muted -mt-1 text-xs">{help}</p>{/if}

	<div class="flex flex-wrap items-start gap-4">
		<!--
			L'apercu sert aussi de zone de depot. Ce n'est qu'un raccourci pour la
			souris : le bouton en dessous fait la meme chose au clavier.
		-->
		<div class="flex w-24 flex-col gap-2">
			<div
				role="presentation"
				ondragover={onDragOver}
				ondragleave={() => (dragging = false)}
				ondrop={onDrop}
				class="rounded-field relative h-24 w-24 {dragging ? 'outline-coral outline-2 outline-offset-2' : ''}"
			>
				{#if src}
					<img
						{src}
						alt=""
						class="rounded-field border-ink/12 h-24 w-24 border object-cover"
						loading="lazy"
					/>
				{:else}
					<div
						class="border-ink/15 rounded-field text-muted flex h-24 w-24 items-center justify-center border border-dashed p-1 text-center text-xs"
					>
						{disabled ? 'Aucune image' : 'Déposez une photo ici'}
					</div>
				{/if}
				{#if uploading}
					<div
						class="bg-paper/85 rounded-field absolute inset-0 flex items-center justify-center text-center text-xs font-semibold"
					>
						Envoi…
					</div>
				{/if}
			</div>

			{#if !disabled}
				<input
					bind:this={fileInput}
					type="file"
					accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
					onchange={onFile}
					class="sr-only"
					tabindex="-1"
					aria-hidden="true"
				/>
				<button
					type="button"
					onclick={() => fileInput?.click()}
					disabled={uploading}
					class="border-ink/25 bg-paper press rounded-pill min-h-11 border px-3 text-xs font-semibold disabled:opacity-60"
				>
					Importer
				</button>
			{/if}
		</div>

		<div class="flex min-w-56 flex-1 flex-col gap-3">
			<label class="flex flex-col gap-1.5">
				<span class="text-sm font-semibold">Adresse de l’image</span>
				<input
					bind:this={srcInput}
					name="{name}.src"
					type="text"
					bind:value={src}
					oninput={onSrcInput}
					list={listId}
					{disabled}
					placeholder="/photos/IMG_2316.JPG"
					class="border-ink/20 bg-paper rounded-field min-h-11 border px-3 py-2"
				/>
			</label>

			{#if uploadError}
				<p class="text-danger text-sm" role="alert">{uploadError}</p>
			{:else if !disabled}
				<p class="text-muted -mt-1 text-xs">
					« Importer » envoie une photo de votre ordinateur : JPEG, PNG, WebP, GIF ou AVIF, 8 Mo
					au maximum.
				</p>
			{/if}

			<!-- Liste native : sans JavaScript, la saisie propose quand meme les
			     adresses connues du site. -->
			<datalist id={listId}>
				{#each library as group (group.label)}
					{#each group.images as image (image.src)}
						<option value={image.src}>{image.alt || group.label}</option>
					{/each}
				{/each}
			</datalist>

			<label class="flex flex-col gap-1.5">
				<span class="text-sm font-semibold">
					Description de l’image <span class="text-danger">*</span>
				</span>
				<span class="text-muted text-xs">
					Ce qu’on voit, pour qui ne voit pas l’image. Une image sans description ne se publie pas.
				</span>
				<textarea
					name="{name}.alt"
					rows="2"
					bind:value={alt}
					{disabled}
					class="border-ink/20 bg-paper rounded-field min-h-11 border px-3 py-2"
				></textarea>
			</label>
		</div>
	</div>

	<!--
		Les dimensions natives reservent la place de l'image avant son arrivee,
		sans quoi la page saute au chargement. Elles sont remplies toutes seules
		quand l'image vient de la bibliotheque ou d'un televersement ; elles
		restent modifiables pour une image hebergee ailleurs.
	-->
	<div class="flex flex-wrap gap-3">
		<label class="flex flex-col gap-1">
			<span class="text-muted text-xs">Largeur d’origine</span>
			<input
				name="{name}.width"
				type="number"
				bind:value={width}
				{disabled}
				class="border-ink/20 bg-paper rounded-field min-h-11 w-28 border px-3 py-2"
			/>
		</label>
		<label class="flex flex-col gap-1">
			<span class="text-muted text-xs">Hauteur d’origine</span>
			<input
				name="{name}.height"
				type="number"
				bind:value={height}
				{disabled}
				class="border-ink/20 bg-paper rounded-field min-h-11 w-28 border px-3 py-2"
			/>
		</label>
	</div>

	{#if !disabled}
		<details class="border-ink/12 rounded-field border">
			<summary class="cursor-pointer px-3 py-2 text-sm font-semibold">
				Choisir dans la bibliothèque du site
			</summary>

			<div class="flex flex-col gap-4 px-3 pt-1 pb-3">
				{#each library as group (group.label)}
					{#if group.images.length > 0}
						<div>
							<p class="text-muted mb-2 text-xs font-semibold">{group.label}</p>
							<ul class="grid grid-cols-4 gap-2 sm:grid-cols-6">
								{#each group.images as image (image.src)}
									<li>
										<button
											type="button"
											onclick={() => choose(image)}
											aria-pressed={src === image.src}
											title={image.alt || image.src}
											class="rounded-field focus-visible:outline-ink block w-full overflow-hidden border-2 focus-visible:outline-2 focus-visible:outline-offset-2 {src ===
											image.src
												? 'border-coral'
												: 'border-transparent'}"
										>
											<img
												src={image.src}
												alt={image.alt}
												loading="lazy"
												class="aspect-square w-full object-cover"
											/>
										</button>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				{/each}
			</div>
		</details>
	{/if}
</fieldset>
