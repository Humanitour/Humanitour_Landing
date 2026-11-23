<script lang="ts">
	import { HOST, LICENSES, LINKS, NAV, ORGANISATION, POLLING, SITE } from '$lib/shared/site';

	const year = new Date().getFullYear();

	/* Les liens sortants, dans l ordre ou ils servent : agir, suivre, verifier. */
	const OUTBOUND = [LINKS.helloasso, LINKS.discord, LINKS.instagram, LINKS.forms, LINKS.repository];

	/*
	 * TODO (decision 13) : les pages `/legal/*` doivent etre recuperees depuis
	 * forms.humanitour.fr et rehebergees ici. Tant qu elles n existent pas, le
	 * pied de page n y renvoie PAS : cinq liens vers des 404 valent moins que
	 * l information elle-meme, qui est affichee ci-dessous. `LEGAL_PAGES` reste
	 * declare dans site.ts pour le jour ou les routes existeront.
	 */
</script>

<!--
	Pied de page sur aplat noir, comme la version principale du logo dans la
	charte. La structure suit ce que le site relie vraiment : un bloc d identite
	large, puis deux listes courtes. Pas quatre colonnes egales a remplir.
-->
<footer class="bg-ink text-paper relative isolate overflow-hidden">
	<!--
		Le nom en tres grand, en sous-fond du pied de page. C est la signature
		d affiche : le meme mot que le logo, a l echelle du papier plutot qu a
		celle d une en-tete.

		`aria-hidden` : le nom est deja porte par le logo en haut de ce meme pied
		de page et par le `title` du document. Le repeter une troisieme fois ne
		donnerait a un lecteur d ecran qu une redite.

		`isolate` sur le pied de page et `-z-10` ici : sans le contexte
		d empilement, le `z-index` negatif ferait passer le mot DERRIERE l aplat
		noir, ou il serait invisible.

		Le corps est en `cqw`, pourcentage de la largeur du CONTENEUR et non du
		viewport : en `vw`, le mot continuerait de grandir apres que le conteneur
		a atteint ses 72rem et deborderait sur les grands ecrans. Le conteneur
		reprend exactement la grille du contenu, le mot se cale donc sur elle.
	-->
	<div class="pointer-events-none absolute inset-x-0 bottom-0 -z-10" aria-hidden="true">
		<!-- `pb` : sans lui, `line-height: 0.74` laisse le bas des capitales tomber
		     sous la boite et le bord du pied de page les rogne. -->
		<div class="wordmark-wrap mx-auto max-w-6xl px-4 pb-5 sm:px-6 sm:pb-7">
			<p class="wordmark">HUMANITOUR</p>
		</div>
	</div>

	<div class="relative mx-auto max-w-6xl px-4 pt-14 pb-28 sm:px-6 sm:pt-16 sm:pb-36">
		<div
			class="grid grid-cols-2 gap-x-6 gap-y-10 sm:gap-x-8 md:grid-cols-[1.5fr_1fr_1fr] md:gap-12"
		>
			<!-- `col-span-2` : le bloc identite (logo, accroche, adhesion) reste en
			     pleine largeur au-dessus des deux colonnes courtes, plutot que de
			     partager une moitie d ecran avec la nav. -->
			<div class="col-span-2 flex flex-col items-start gap-4 md:col-span-1">
				<img
					src="/logo-lockup-paper.png"
					alt={SITE.name}
					width="1200"
					height="335"
					loading="lazy"
					decoding="async"
					class="h-10 w-auto"
				/>
				<p class="font-hand text-3xl leading-tight">{SITE.tagline}</p>
				<a
					href={LINKS.helloasso.href}
					target="_blank"
					rel="noopener noreferrer"
					class="btn-3d btn-3d-brand rounded-pill px-5 py-3 text-sm font-semibold"
				>
					Adhérer à l'association
				</a>
			</div>

			<!-- `min-w-0` : sans lui, une cellule de grille garde une largeur minimale
			     egale a son contenu le plus long et peut faire deborder toute la
			     grille sur un ecran etroit. -->
			<nav aria-labelledby="footer-nav" class="min-w-0">
				<h2 id="footer-nav" class="mb-1 text-base font-semibold">Le site</h2>
				<!--
					Dix liens dans une seule colonne faisaient une liste trop haute pour
					se lire d un coup d oeil. `columns-2`, et non `grid-cols-2` : le flux
					en colonnes CSS remplit la premiere colonne avant la seconde, donc
					l ordre de lecture reste haut en bas puis colonne suivante, pas une
					grille ligne par ligne. Reserve au grand ecran, ou la colonne nav a
					la place pour deux ; sur mobile elle est deja cote a cote avec le
					bloc association et une seule liste y reste plus lisible.
				-->
				<div class="md:columns-2 md:gap-x-6">
					{#each NAV as item (item.href)}
						<a
							href={item.href}
							class="block py-1.5 text-sm break-inside-avoid text-white/75 hover:text-white"
						>
							{item.label}
						</a>
					{/each}
					<!-- Hors `NAV` : l'infolettre se rejoint de partout, mais elle n'a
					     pas sa place dans la barre du haut, deja pleine. -->
					<a
						href="/infolettre"
						class="block py-1.5 text-sm break-inside-avoid text-white/75 hover:text-white"
					>
						Infolettre
					</a>
					{#each OUTBOUND as link (link.href)}
						<a
							href={link.href}
							target="_blank"
							rel="noopener noreferrer"
							class="block py-1.5 text-sm break-inside-avoid text-white/75 hover:text-white"
						>
							{link.label}
						</a>
					{/each}
				</div>
			</nav>

			<div class="flex min-w-0 flex-col items-start gap-1">
				<h2 class="mb-1 text-base font-semibold">L'association</h2>
				<p class="text-sm text-white/75">
					{ORGANISATION.form}.<br />
					RNA {ORGANISATION.rna}.<br />
					{ORGANISATION.address}
				</p>
				<p class="mt-2 text-sm text-white/75">
					Directeur de publication : {ORGANISATION.publicationDirector}.<br />
					Hébergé par {HOST.name}, {HOST.dataCenter}.
				</p>
				<a
					href="mailto:{SITE.email}"
					class="py-1.5 text-sm wrap-break-word text-white/75 underline decoration-2 underline-offset-2 hover:text-white"
				>
					{SITE.email}
				</a>
				<a
					href={POLLING.commissionUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="py-1.5 text-sm text-white/75 underline decoration-2 underline-offset-2 hover:text-white"
				>
					Commission des sondages
				</a>
			</div>
		</div>

		<div
			class="mt-12 flex flex-col gap-3 border-t border-white/20 pt-6 text-sm text-white/70 sm:flex-row sm:items-baseline sm:justify-between"
		>
			<!-- L identite complete est dans la colonne ci-dessus : ici, la seule
			     mention de propriete, pour ne pas la repeter deux fois. -->
			<p>© {year} {ORGANISATION.legalName}</p>
			<p class="shrink-0">
				Code sous
				<a
					class="underline decoration-2 underline-offset-2 hover:text-white"
					href={LICENSES.code.url}
					target="_blank"
					rel="noopener noreferrer">{LICENSES.code.name}</a
				>, données sous
				<a
					class="underline decoration-2 underline-offset-2 hover:text-white"
					href={LICENSES.data.url}
					target="_blank"
					rel="noopener noreferrer">{LICENSES.data.name}</a
				>
			</p>
		</div>
	</div>
</footer>

<style>
	.wordmark-wrap {
		container-type: inline-size;
	}

	.wordmark {
		font-family: var(--font-display);
		/* Accorde a la chasse reelle de Bowlby One sur ces dix signes : mesure
		   dans le navigateur, pas estimee. */
		font-size: 13.2cqw;
		line-height: 0.74;
		letter-spacing: -0.015em;
		white-space: nowrap;
		text-align: center;
		/*
		 * Il passe SOUS du texte : l opacite est calee pour qu il se voie sans
		 * disputer la lecture. A 0,12, le fond local monte a #1F1F1F ; le blanc
		 * y garde 15,9:1 et le blanc a 75 % encore 7,4:1, tous deux tres
		 * au-dessus du seuil AA.
		 */
		color: rgb(255 255 255 / 0.12);
	}
</style>
