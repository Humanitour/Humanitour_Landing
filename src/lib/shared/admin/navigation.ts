import { can, type Permission, type PermissionHolder } from '$lib/shared/permissions';

/**
 * Plan du back-office.
 *
 * Une seule declaration pour le menu, les raccourcis du tableau de bord et le
 * fil d'Ariane : une entree ajoutee ici apparait partout, et une entree oubliee
 * nulle part. La version precedente tenait la liste dans `+layout.svelte`, donc
 * chaque ecran qui voulait pointer vers une section recopiait son adresse.
 *
 * Les groupes ne sont pas decoratifs : sept entrees a plat se lisent comme une
 * liste de courses, et l'oeil n'y trouve pas « Medias » sans relire les sept.
 * Trois familles de quatre au plus se balaient d'un coup.
 */

export interface AdminLink {
	readonly href: string;
	readonly label: string;
	/** Ce que la section fait, en une ligne. Sert aux raccourcis et aux infobulles. */
	readonly description: string;
	readonly permission: Permission;
}

export interface AdminSection {
	readonly label: string;
	readonly links: readonly AdminLink[];
}

export const ADMIN_NAVIGATION: readonly AdminSection[] = [
	{
		label: 'Le site',
		links: [
			{
				href: '/admin/contenu',
				label: 'Pages du site',
				description: 'Composer et publier les pages publiques.',
				permission: 'content.read'
			},
			{
				href: '/admin/medias',
				label: 'Médiathèque',
				description: 'Articles, vidéos, podcasts et reprises de presse.',
				permission: 'media.read'
			},
			{
				href: '/admin/infolettre',
				label: 'Infolettre',
				description: 'Les personnes abonnées et leur consentement.',
				permission: 'newsletter.read'
			},
			{
				href: '/admin/infolettre/campagnes',
				label: 'Campagnes',
				description: 'Rédiger, essayer et diffuser l’infolettre.',
				permission: 'newsletter.send'
			}
		]
	},
	{
		label: 'Le courrier',
		links: [
			{
				href: '/admin/courrier',
				label: 'Courrier',
				description: 'Les boîtes de l’association : lire, répondre, écrire.',
				permission: 'mail.use'
			},
			{
				href: '/admin/courrier/boites',
				label: 'Boîtes',
				description: 'Les adresses, leurs membres et la boîte attrape-tout.',
				permission: 'mail.admin'
			}
		]
	},
	{
		label: 'Les enquêtes',
		links: [
			{
				href: '/admin/sondages',
				label: 'Sondages',
				description: 'Questionnaires, collecte et publication des résultats.',
				permission: 'survey.read'
			}
		]
	},
	{
		label: "L'association",
		links: [
			{
				href: '/admin/planning',
				label: 'Planning',
				description: 'Calendrier éditorial, enquêtes, tâches, présences et absences.',
				permission: 'planning.read'
			},
			{
				href: '/admin/equipe',
				label: 'Équipe',
				description: 'Les comptes, leurs rôles et les invitations.',
				permission: 'user.read'
			},
			{
				href: '/admin/roles',
				label: 'Rôles',
				description: 'Ce que chaque rôle a le droit de faire.',
				permission: 'role.manage'
			}
		]
	},
	{
		label: 'Le système',
		links: [
			{
				href: '/admin/reglages',
				label: 'Réglages',
				description: "Seuil d'anonymat, synchronisation, paramètres.",
				permission: 'settings.manage'
			},
			{
				href: '/admin/journal',
				label: 'Journal',
				description: 'Qui a fait quoi, et quand.',
				permission: 'audit.read'
			}
		]
	}
];

/**
 * Le plan tel que ce compte peut le parcourir.
 *
 * Une entree menant a un 403 est une promesse non tenue : la permission decide
 * de l'affichage comme elle decide de l'acces. Un groupe dont toutes les
 * entrees tombent disparait avec elles, au lieu de laisser un titre seul.
 */
export function visibleNavigation(holder: PermissionHolder | null): AdminSection[] {
	return ADMIN_NAVIGATION.map((section) => ({
		label: section.label,
		links: section.links.filter((link) => can(holder, link.permission))
	})).filter((section) => section.links.length > 0);
}

/** Toutes les entrees, groupes aplatis. */
export function allLinks(): AdminLink[] {
	return ADMIN_NAVIGATION.flatMap((section) => section.links);
}

/**
 * L'entree dont depend l'adresse courante.
 *
 * On retient la plus longue qui corresponde : `/admin/medias/xyz` appartient a
 * `/admin/medias`, et une entree `/admin` couvrirait tout si on prenait la
 * premiere venue.
 */
export function currentLink(pathname: string): AdminLink | null {
	let found: AdminLink | null = null;

	for (const link of allLinks()) {
		const matches = pathname === link.href || pathname.startsWith(`${link.href}/`);
		if (matches && (found === null || link.href.length > found.href.length)) found = link;
	}

	return found;
}
