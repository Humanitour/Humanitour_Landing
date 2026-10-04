<script lang="ts">
	import { enhance } from '$app/forms';
	import { closeAfter } from '$components/admin/enhance';
	import Dialog from '$components/admin/Dialog.svelte';
	import Flash from '$components/admin/Flash.svelte';
	import PageHeader from '$components/admin/PageHeader.svelte';
	import Panel from '$components/admin/Panel.svelte';
	import {
		WEEKDAYS,
		dayNumber,
		formatDay,
		formatDayShort,
		formatMonth,
		parseMonth
	} from '$lib/shared/planning/calendar';
	import {
		PLANNING_LAYERS,
		planningQuery,
		toggleLayer,
		type PlanningEntry,
		type PlanningLayer
	} from '$lib/shared/planning/entries';
	import { can } from '$lib/shared/permissions';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const organizer = $derived(can(data.user, 'planning.write'));
	const monthTitle = $derived(formatMonth(parseMonth(data.month, data.today)));
	const currentMonth = $derived(data.today.slice(0, 7));

	/**
	 * Un repere par calque, en plus de son nom.
	 *
	 * Les teintes sont celles de la palette des graphiques, deja validees en
	 * daltonisme ; elles ne portent jamais seules l'information : la legende
	 * nomme chaque calque, et chaque etiquette le redit au lecteur d'ecran et
	 * dans sa fiche.
	 */
	const LAYER_MARK: Record<PlanningLayer, string> = {
		editorial: '#FF5757',
		meeting: '#1f6fb0',
		survey: '#0f8a6c',
		media: '#ff751f',
		task: '#5b48a6',
		presence: '#9a9a9a'
	};

	/** Dans une case, au-dela de ce nombre, le reste se lit dans la fiche du jour. */
	const CELL_LIMIT = 4;

	type Opened =
		| { kind: 'entry'; entry: PlanningEntry }
		| { kind: 'day'; day: string }
		| { kind: 'event' | 'task' | 'availability'; day: string }
		| null;

	let opened = $state<Opened>(null);

	function close() {
		opened = null;
	}

	/**
	 * Fermeture venue du navigateur (Echap, clic sur le fond).
	 *
	 * Le `<dialog>` emet `close` APRES coup, de facon asynchrone. Passer de la
	 * fiche d'un jour au formulaire d'evenement ferme la premiere fenetre, et
	 * son `close` arrivait alors que la seconde etait deja ouverte : un
	 * `close()` aveugle la refermait aussitot. Chaque fenetre ne ferme donc que
	 * si c'est encore elle qui est ouverte.
	 */
	function closeIf(kind: NonNullable<Opened>['kind']) {
		return () => {
			if (opened?.kind === kind) opened = null;
		};
	}

	function layerHref(layer: PlanningLayer): string {
		return planningQuery(data.month, toggleLayer(data.layers, layer));
	}

	function monthHref(month: string): string {
		return planningQuery(month, data.layers);
	}

	function period(entry: PlanningEntry): string {
		if (entry.start === entry.end) {
			return entry.time ? `${formatDay(entry.start)}, ${entry.time}` : formatDay(entry.start);
		}
		return `Du ${formatDay(entry.start)} au ${formatDay(entry.end)}`;
	}

	function canRemove(entry: PlanningEntry): boolean {
		if (entry.source === 'event' || entry.source === 'task') return organizer;
		if (entry.source === 'availability') return organizer || entry.ownerId === data.user.id;
		return false;
	}

	const openedEntry = $derived(opened?.kind === 'entry' ? opened.entry : null);
	const openedTask = $derived(
		openedEntry?.source === 'task'
			? data.tasks.find((task) => task.id === openedEntry.sourceId)
			: undefined
	);
	const formDay = $derived(opened && 'day' in opened ? opened.day : data.today);

	const statusClasses: Record<string, string> = {
		TODO: 'border-ink/25 bg-paper',
		DOING: 'border-warning/40 bg-warning/10 text-warning',
		DONE: 'border-success/40 bg-success/10 text-success'
	};

	const fieldClass = 'border-ink/20 bg-paper rounded-field min-h-11 border px-3 py-2';
	const primary =
		'bg-ink text-paper press rounded-pill inline-flex min-h-11 items-center justify-center px-4 py-2 text-sm font-semibold';
	const secondary =
		'border-ink/25 bg-paper press rounded-pill inline-flex min-h-11 items-center justify-center border px-4 py-2 text-sm font-semibold';
</script>

<svelte:head><title>Planning, back-office</title></svelte:head>

{#snippet chip(entry: PlanningEntry, compact: boolean)}
	<button
		type="button"
		onclick={() => (opened = { kind: 'entry', entry })}
		class="hover:bg-cream focus-visible:outline-ink rounded-field flex w-full min-w-0 items-start gap-1.5 px-1.5 py-1 text-left text-xs focus-visible:outline-2 {compact
			? ''
			: 'min-h-11 items-center text-sm'}"
	>
		<span
			aria-hidden="true"
			class="mt-1 inline-block h-2 w-2 shrink-0 rounded-sm {compact ? '' : 'mt-0'}"
			style="background-color: {LAYER_MARK[entry.layer]}"
		></span>
		<span class="min-w-0 flex-1">
			<span class="sr-only">{PLANNING_LAYERS[entry.layer].label} : </span>
			{#if entry.time}<span class="font-mono text-[0.7rem]">{entry.time}</span>{/if}
			<span class={compact ? 'line-clamp-2 break-words' : ''}>{entry.title}</span>
			{#if entry.badge}
				<span class={entry.alert ? 'text-danger font-semibold' : 'text-muted'}>
					· {entry.badge}
				</span>
			{/if}
		</span>
	</button>
{/snippet}

<PageHeader
	title="Planning"
	description="Le calendrier éditorial, les jalons des enquêtes, les publications de médias, les tâches et qui est là."
>
	{#snippet actions()}
		{#if organizer}
			<button
				type="button"
				class={primary}
				onclick={() => (opened = { kind: 'event', day: data.today })}
			>
				Nouvel événement
			</button>
			<button
				type="button"
				class={secondary}
				onclick={() => (opened = { kind: 'task', day: data.today })}
			>
				Nouvelle tâche
			</button>
		{/if}
		<button
			type="button"
			class={secondary}
			onclick={() => (opened = { kind: 'availability', day: data.today })}
		>
			Déclarer une présence ou une absence
		</button>
	{/snippet}
</PageHeader>

<Flash message={form?.message} />

<div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
	<section aria-labelledby="mois" class="min-w-0">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<div class="flex items-center gap-2">
				<a href={monthHref(data.previous)} class={secondary} aria-label="Mois précédent">‹</a>
				<h2 id="mois" class="min-w-40 text-center text-xl font-bold first-letter:uppercase">
					{monthTitle}
				</h2>
				<a href={monthHref(data.next)} class={secondary} aria-label="Mois suivant">›</a>
			</div>
			{#if data.month !== currentMonth}
				<a href={monthHref(currentMonth)} class="text-coral-ink text-sm font-semibold underline">
					Revenir à aujourd’hui
				</a>
			{/if}
		</div>

		<!--
			Les calques sont des liens et non des cases a cocher : chaque etat a son
			adresse, se partage et fonctionne sans JavaScript.
		-->
		<nav aria-label="Calques affichés" class="mb-4 flex flex-wrap gap-2">
			{#each data.layerOptions as layer (layer.key)}
				{@const active = data.layers.includes(layer.key as PlanningLayer)}
				<a
					href={layerHref(layer.key as PlanningLayer)}
					title={layer.description}
					class="rounded-pill inline-flex min-h-11 items-center gap-2 border px-3 text-sm {active
						? 'border-ink bg-paper font-semibold'
						: 'border-ink/20 text-muted bg-cream line-through'}"
				>
					<span
						aria-hidden="true"
						class="inline-block h-2.5 w-2.5 rounded-sm"
						style="background-color: {LAYER_MARK[layer.key as PlanningLayer]}"
					></span>
					{layer.label}
					<span class="sr-only">{active ? ', affiché' : ', masqué'}</span>
				</a>
			{/each}
		</nav>

		<!-- Grand ecran : la grille du mois. -->
		<div class="panel hidden overflow-hidden md:block">
			<table class="w-full table-fixed border-collapse">
				<caption class="sr-only">Planning de {monthTitle}</caption>
				<thead>
					<tr class="border-ink/12 bg-cream border-b">
						{#each WEEKDAYS as weekday (weekday)}
							<th scope="col" class="text-muted px-2 py-2 text-left text-xs font-semibold">
								<abbr title={weekday} class="no-underline">{weekday.slice(0, 3)}.</abbr>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each data.weeks as week (week[0])}
						<tr class="border-ink/12 border-b last:border-0">
							{#each week as day (day)}
								{@const entries = data.byDay[day] ?? []}
								{@const outside = day < data.monthStart || day > data.monthEnd}
								<td
									class="border-ink/12 h-32 border-r align-top last:border-r-0 {outside
										? 'bg-cream/60'
										: ''}"
								>
									<div class="flex items-center justify-between px-1 pt-1">
										<button
											type="button"
											onclick={() => (opened = { kind: 'day', day })}
											aria-label="Voir le {formatDay(day)}{entries.length > 0
												? `, ${entries.length} entrée${entries.length > 1 ? 's' : ''}`
												: ''}"
											class="focus-visible:outline-ink inline-flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-sm focus-visible:outline-2 {day ===
											data.today
												? 'bg-ink text-paper font-bold'
												: outside
													? 'text-muted'
													: 'font-semibold'}"
										>
											{dayNumber(day)}
										</button>
									</div>
									<ul class="flex flex-col px-0.5 pb-1">
										{#each entries.slice(0, CELL_LIMIT) as entry (entry.id)}
											<li>{@render chip(entry, true)}</li>
										{/each}
									</ul>
									{#if entries.length > CELL_LIMIT}
										<button
											type="button"
											onclick={() => (opened = { kind: 'day', day })}
											class="text-coral-ink focus-visible:outline-ink mx-1 mb-1 rounded px-1 text-xs font-semibold underline focus-visible:outline-2"
										>
											{entries.length - CELL_LIMIT} de plus
										</button>
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!--
			Petit ecran : sept colonnes n'y tiennent pas. Le mois devient un agenda,
			qui ne liste que les jours ou il se passe quelque chose.
		-->
		<div class="md:hidden">
			{#each data.weeks
				.flat()
				.filter((day) => day >= data.monthStart && day <= data.monthEnd && (data.byDay[day]?.length ?? 0) > 0) as day (day)}
				<section class="panel mb-3 p-3" aria-label={formatDay(day)}>
					<h3 class="mb-1 text-sm font-bold first-letter:uppercase">
						{formatDay(day)}
						{#if day === data.today}<span class="text-coral-ink"> · aujourd’hui</span>{/if}
					</h3>
					<ul>
						{#each data.byDay[day] ?? [] as entry (entry.id)}
							<li>{@render chip(entry, false)}</li>
						{/each}
					</ul>
				</section>
			{:else}
				<div
					class="border-ink/20 rounded-panel bg-cream border border-dashed p-6 text-center text-sm"
				>
					Rien de prévu en {monthTitle} sur les calques affichés.
				</div>
			{/each}
		</div>
	</section>

	<aside class="flex min-w-0 flex-col gap-6">
		<Panel
			title="Cette semaine"
			description="Présences et absences déclarées, à partir d’aujourd’hui."
		>
			{@const declared = data.week.filter((day) => (data.presenceWeek[day]?.length ?? 0) > 0)}
			{#if declared.length === 0}
				<p class="text-muted text-sm">Personne n’a rien déclaré pour les sept prochains jours.</p>
			{:else}
				<ul class="flex flex-col gap-3">
					{#each declared as day (day)}
						<li>
							<p class="text-muted text-xs font-semibold first-letter:uppercase">
								{day === data.today ? 'Aujourd’hui' : formatDayShort(day)}
							</p>
							<ul>
								{#each data.presenceWeek[day] ?? [] as entry (entry.id)}
									<li>{@render chip(entry, false)}</li>
								{/each}
							</ul>
						</li>
					{/each}
				</ul>
			{/if}
		</Panel>

		<Panel title="Tâches" description="Les vôtres d’abord, puis par échéance.">
			{#if data.tasks.length === 0}
				<p class="text-muted text-sm">
					Aucune tâche en cours.{organizer ? ' « Nouvelle tâche » en crée une.' : ''}
				</p>
			{:else}
				<ul class="flex flex-col gap-3">
					{#each data.tasks as task (task.id)}
						{@const mine = task.assigneeId === data.user.id}
						<li class="border-ink/12 border-b pb-3 last:border-0 last:pb-0">
							<p
								class="text-sm font-semibold {task.status === 'DONE'
									? 'text-muted line-through'
									: ''}"
							>
								{task.title}
							</p>
							<p class="text-muted text-xs">
								{task.assigneeName ?? 'Sans responsable'}{mine ? ' (vous)' : ''}
								{#if task.dueOn}
									· <span class={task.overdue ? 'text-danger font-semibold' : ''}>
										{task.overdue ? 'en retard, ' : ''}pour le {formatDayShort(task.dueOn)}
									</span>
								{/if}
							</p>
							{#if mine || organizer}
								<form
									method="POST"
									action="?/setTaskStatus"
									use:enhance
									class="mt-2 flex flex-wrap gap-1.5"
								>
									<input type="hidden" name="id" value={task.id} />
									{#each data.taskStatuses as status (status.key)}
										<button
											type="submit"
											name="status"
											value={status.key}
											aria-pressed={task.status === status.key}
											class="rounded-pill press min-h-11 border px-3 text-xs font-semibold {task.status ===
											status.key
												? statusClasses[status.key]
												: 'border-ink/15 text-muted bg-paper'}"
										>
											{status.label}
										</button>
									{/each}
								</form>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</Panel>
	</aside>
</div>

<!-- Fiche d'une entree -->
<Dialog open={openedEntry !== null} title={openedEntry?.title ?? ''} onClose={closeIf('entry')}>
	{#if openedEntry}
		<dl class="flex flex-col gap-2">
			<div>
				<dt class="text-muted text-xs">Calque</dt>
				<dd class="flex items-center gap-2 font-semibold">
					<span
						aria-hidden="true"
						class="inline-block h-2.5 w-2.5 rounded-sm"
						style="background-color: {LAYER_MARK[openedEntry.layer]}"
					></span>
					{PLANNING_LAYERS[openedEntry.layer].label}{openedEntry.badge
						? `, ${openedEntry.badge.toLowerCase()}`
						: ''}
				</dd>
			</div>
			<div>
				<dt class="text-muted text-xs">Quand</dt>
				<dd class="first-letter:uppercase">{period(openedEntry)}</dd>
			</div>
			{#if openedEntry.note}
				<div>
					<dt class="text-muted text-xs">Note</dt>
					<dd class="whitespace-pre-line">{openedEntry.note}</dd>
				</div>
			{/if}
			{#if openedTask}
				<div>
					<dt class="text-muted text-xs">Responsable</dt>
					<dd>{openedTask.assigneeName ?? 'Personne'}</dd>
				</div>
			{/if}
		</dl>
	{/if}
	{#snippet footer()}
		{#if openedEntry && canRemove(openedEntry)}
			<form
				method="POST"
				action="?/{openedEntry.source === 'event'
					? 'deleteEvent'
					: openedEntry.source === 'task'
						? 'deleteTask'
						: 'deleteAvailability'}"
				use:enhance={closeAfter(close)}
			>
				<input type="hidden" name="id" value={openedEntry.sourceId} />
				<button type="submit" class="{secondary} text-danger">Retirer du planning</button>
			</form>
		{/if}
		{#if openedEntry?.href}
			<a href={openedEntry.href} class={primary}>Ouvrir la fiche</a>
		{/if}
		<button type="button" class={secondary} onclick={close}>Fermer</button>
	{/snippet}
</Dialog>

<!-- Fiche d'un jour -->
<Dialog
	open={opened?.kind === 'day'}
	title={opened?.kind === 'day' ? formatDay(opened.day) : ''}
	onClose={closeIf('day')}
>
	{#if opened?.kind === 'day'}
		{@const day = opened.day}
		{@const entries = data.byDay[day] ?? []}
		{#if entries.length === 0}
			<p class="text-muted">Rien de prévu ce jour-là sur les calques affichés.</p>
		{:else}
			<ul>
				{#each entries as entry (entry.id)}
					<li>{@render chip(entry, false)}</li>
				{/each}
			</ul>
		{/if}
	{/if}
	{#snippet footer()}
		{#if opened?.kind === 'day'}
			{@const day = opened.day}
			{#if organizer}
				<button type="button" class={secondary} onclick={() => (opened = { kind: 'event', day })}>
					Ajouter un événement
				</button>
			{/if}
			<button
				type="button"
				class={secondary}
				onclick={() => (opened = { kind: 'availability', day })}
			>
				Déclarer
			</button>
		{/if}
		<button type="button" class={secondary} onclick={close}>Fermer</button>
	{/snippet}
</Dialog>

<!-- Nouvel evenement -->
<Dialog open={opened?.kind === 'event'} title="Nouvel événement" onClose={closeIf('event')}>
	{#key formDay}
		<form
			id="form-event"
			method="POST"
			action="?/createEvent"
			use:enhance={closeAfter(close)}
			class="flex flex-col gap-3"
		>
			<label class="flex flex-col gap-1.5">
				<span class="font-semibold">Titre</span>
				<input name="title" required maxlength="200" class={fieldClass} />
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="font-semibold">Nature</span>
				<select name="kind" class={fieldClass}>
					{#each data.eventKinds as kind (kind.key)}
						<option value={kind.key}>{kind.label}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="font-semibold">Canal</span>
				<span class="text-muted text-xs"
					>Pour une publication prévue : Instagram, presse, infolettre…</span
				>
				<input name="channel" maxlength="80" class={fieldClass} />
			</label>
			<div class="flex flex-wrap gap-3">
				<label class="flex flex-col gap-1.5">
					<span class="font-semibold">Jour</span>
					<input type="date" name="startDay" required value={formDay} class={fieldClass} />
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="font-semibold">Heure</span>
					<input type="time" name="startTime" class={fieldClass} />
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="font-semibold">Jusqu’au</span>
					<input type="date" name="endDay" min={formDay} class={fieldClass} />
				</label>
			</div>
			<p class="text-muted -mt-1 text-xs">Sans heure, l’événement occupe la journée entière.</p>
			<label class="flex flex-col gap-1.5">
				<span class="font-semibold">Note</span>
				<textarea name="note" rows="3" maxlength="2000" class={fieldClass}></textarea>
			</label>
		</form>
	{/key}
	{#snippet footer()}
		<button type="button" class={secondary} onclick={close}>Annuler</button>
		<button type="submit" form="form-event" class={primary}>Ajouter</button>
	{/snippet}
</Dialog>

<!-- Nouvelle tache -->
<Dialog open={opened?.kind === 'task'} title="Nouvelle tâche" onClose={closeIf('task')}>
	<form
		id="form-task"
		method="POST"
		action="?/createTask"
		use:enhance={closeAfter(close)}
		class="flex flex-col gap-3"
	>
		<label class="flex flex-col gap-1.5">
			<span class="font-semibold">Ce qu’il faut faire</span>
			<input name="title" required maxlength="200" class={fieldClass} />
		</label>
		<div class="flex flex-wrap gap-3">
			<label class="flex flex-1 flex-col gap-1.5">
				<span class="font-semibold">Responsable</span>
				<select name="assigneeId" class={fieldClass}>
					<option value="">Personne pour l’instant</option>
					{#each data.members as member (member.id)}
						<option value={member.id}>{member.name}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="font-semibold">Échéance</span>
				<input type="date" name="dueOn" class={fieldClass} />
			</label>
		</div>
		<label class="flex flex-col gap-1.5">
			<span class="font-semibold">Note</span>
			<textarea name="note" rows="3" maxlength="2000" class={fieldClass}></textarea>
		</label>
	</form>
	{#snippet footer()}
		<button type="button" class={secondary} onclick={close}>Annuler</button>
		<button type="submit" form="form-task" class={primary}>Créer la tâche</button>
	{/snippet}
</Dialog>

<!-- Presence ou absence -->
<Dialog
	open={opened?.kind === 'availability'}
	title="Présence ou absence"
	onClose={closeIf('availability')}
>
	{#key formDay}
		<form
			id="form-availability"
			method="POST"
			action="?/createAvailability"
			use:enhance={closeAfter(close)}
			class="flex flex-col gap-3"
		>
			<fieldset class="flex flex-wrap gap-4">
				<legend class="mb-1.5 font-semibold">Vous serez</legend>
				{#each data.availabilityKinds as kind, index (kind.key)}
					<label class="flex min-h-11 items-center gap-2">
						<input
							type="radio"
							name="kind"
							value={kind.key}
							checked={index === 1}
							class="h-5 w-5"
						/>
						{kind.label.toLowerCase()}
					</label>
				{/each}
			</fieldset>
			{#if organizer}
				<label class="flex flex-col gap-1.5">
					<span class="font-semibold">Pour</span>
					<select name="userId" class={fieldClass}>
						{#each data.members as member (member.id)}
							<option value={member.id} selected={member.id === data.user.id}>
								{member.name}{member.id === data.user.id ? ' (vous)' : ''}
							</option>
						{/each}
					</select>
				</label>
			{/if}
			<div class="flex flex-wrap gap-3">
				<label class="flex flex-col gap-1.5">
					<span class="font-semibold">Du</span>
					<input type="date" name="startsOn" required value={formDay} class={fieldClass} />
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="font-semibold">Au</span>
					<input type="date" name="endsOn" min={formDay} class={fieldClass} />
				</label>
			</div>
			<p class="text-muted -mt-1 text-xs">Sans jour de fin, la période tient en un jour.</p>
			<label class="flex flex-col gap-1.5">
				<span class="font-semibold">Note</span>
				<span class="text-muted text-xs">
					Visible par toute l’équipe : un lieu, un moyen de vous joindre. Pas le motif d’une
					absence.
				</span>
				<input name="note" maxlength="2000" class={fieldClass} />
			</label>
		</form>
	{/key}
	{#snippet footer()}
		<button type="button" class={secondary} onclick={close}>Annuler</button>
		<button type="submit" form="form-availability" class={primary}>Enregistrer</button>
	{/snippet}
</Dialog>
