<script lang="ts">
	import Button from '$components/Button.svelte';
	import { LINKS, SITE } from '$lib/shared/site';
</script>

<svelte:head>
	<title>Participer | {SITE.name}</title>
	<meta
		name="description"
		content="Trois manières de participer à Humanitour : répondre aux sondages citoyens, soutenir la campagne HelloAsso ou rejoindre la communauté."
	/>
</svelte:head>

<header class="surface-mesh">
	<div class="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
		<h1 class="max-w-3xl text-4xl sm:text-5xl">Participer à {SITE.name}</h1>
		<p class="measure mt-5 text-lg leading-relaxed">
			Un institut de sondage citoyen ne vit pas sans les citoyen·ne·s. Trois manières simples de
			prendre part au projet, selon le temps et l'énergie que vous souhaitez y consacrer.
		</p>
	</div>
</header>

<div class="bg-cream">
	<div class="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
		<ol class="grid gap-6 lg:grid-cols-3">
			<li class="block-card flex flex-col justify-between p-7 sm:p-8">
				<div>
					<p class="text-coral-ink text-sm font-semibold tracking-wide uppercase">01 · S’exprimer</p>
					<h2 class="mt-3 text-2xl">Répondre aux sondages</h2>
					<p class="text-ink-soft mt-4 leading-relaxed">
						Participez aux enquêtes citoyennes en cours en quelques minutes, sans créer de compte.
						Vos réponses alimentent les résultats publiés en données brutes.
					</p>
				</div>
				<div class="mt-8">
					<Button href="/repondre" variant="primary">Répondre aux enquêtes</Button>
				</div>
			</li>

			<li class="block-card flex flex-col justify-between p-7 sm:p-8">
				<div>
					<p class="text-coral-ink text-sm font-semibold tracking-wide uppercase">02 · Soutenir</p>
					<h2 class="mt-3 text-2xl">Donner ou adhérer</h2>
					<p class="text-ink-soft mt-4 leading-relaxed">
						Aucun milliardaire ne nous finance. Votre don ou adhésion sur HelloAsso finance les
						prochaines enquêtes de terrain et garantit notre indépendance.
					</p>
				</div>
				<div class="mt-8">
					<Button href={LINKS.helloasso.href} variant="brand" external>
						Soutenir sur HelloAsso
					</Button>
				</div>
			</li>

			<li class="block-card flex flex-col justify-between p-7 sm:p-8">
				<div>
					<p class="text-coral-ink text-sm font-semibold tracking-wide uppercase">03 · S’impliquer</p>
					<h2 class="mt-3 text-2xl">Nous rejoindre</h2>
					<p class="text-ink-soft mt-4 leading-relaxed">
						Proposez les prochaines questions sur Discord, suivez les coulisses sur Instagram ou
						recevez les résultats par courriel dès leur sortie.
					</p>
				</div>
				<div class="mt-8 flex flex-wrap gap-3">
					<Button href={LINKS.discord.href} variant="outline" external>Rejoindre le Discord</Button>
					<Button href="/infolettre" variant="ghost">Infolettre</Button>
				</div>
			</li>
		</ol>
	</div>
</div>
