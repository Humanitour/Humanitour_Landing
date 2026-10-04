/**
 * Registre des permissions atomiques.
 *
 * C'est la seule source de verite. Un role n'est qu'une liste de ces cles,
 * editable au back-office : ajouter un role ne demande aucun deploiement
 * (CLAUDE.md, decision 17).
 *
 * Ajouter une permission = ajouter une entree ici, et rien d'autre.
 */

export interface PermissionDefinition {
	/** Groupe d'affichage au back-office. */
	readonly group: string;
	readonly label: string;
	readonly description: string;
	/**
	 * Une permission sensible touche a ce qui est publie ou a qui peut publier.
	 * Le back-office la fait ressortir et exige une confirmation explicite.
	 */
	readonly sensitive?: boolean;
}

export const PERMISSIONS = {
	'survey.read': {
		group: 'Sondages',
		label: 'Consulter les sondages',
		description: 'Voir les enquetes, y compris les brouillons non publies.'
	},
	'survey.write': {
		group: 'Sondages',
		label: 'Creer et modifier les sondages',
		description: 'Creer une enquete, editer son questionnaire et sa methodologie.'
	},
	'survey.sync': {
		group: 'Sondages',
		label: 'Relier et synchroniser Openforms',
		description:
			'Relier une enquete a un formulaire de forms.humanitour.fr, etablir la correspondance des champs et declencher une synchronisation.'
	},
	'survey.publish': {
		group: 'Sondages',
		label: 'Publier un sondage',
		description: 'Rendre une enquete et ses donnees brutes accessibles a tous.',
		sensitive: true
	},
	'survey.delete': {
		group: 'Sondages',
		label: 'Supprimer un sondage',
		description: 'Supprimer definitivement une enquete et toutes ses reponses.',
		sensitive: true
	},
	'survey.weight': {
		group: 'Sondages',
		label: 'Redresser un sondage',
		description:
			'Saisir les marges cibles, lancer le calage des poids et proposer la lecture redressee au public, a cote de la lecture brute.',
		sensitive: true
	},
	'card.write': {
		group: 'Sondages',
		label: 'Gerer les cartes de visualisation',
		description: 'Creer, modifier et ordonner les graphiques mis en avant.'
	},
	'card.publish': {
		group: 'Sondages',
		label: 'Publier une carte',
		description: 'Afficher une carte de visualisation sur la page publique.',
		sensitive: true
	},

	'media.read': {
		group: 'Mediatheque',
		label: 'Consulter la mediatheque',
		description: 'Voir les articles, videos, podcasts et reprises de presse, brouillons inclus.'
	},
	'media.write': {
		group: 'Mediatheque',
		label: 'Rediger et modifier',
		description: 'Creer et editer un media, sans pouvoir le publier.'
	},
	'media.publish': {
		group: 'Mediatheque',
		label: 'Publier un media',
		description: 'Mettre en ligne ou programmer la publication d un media.',
		sensitive: true
	},
	'media.delete': {
		group: 'Mediatheque',
		label: 'Supprimer un media',
		description: 'Supprimer definitivement un media.',
		sensitive: true
	},

	'content.read': {
		group: 'Contenu du site',
		label: 'Consulter le contenu des pages',
		description: 'Voir les pages editables du site public, brouillons inclus.'
	},
	'content.write': {
		group: 'Contenu du site',
		label: 'Modifier le contenu des pages',
		description: 'Ajouter, editer et reordonner les blocs, sans les mettre en ligne.'
	},
	'content.publish': {
		group: 'Contenu du site',
		label: 'Publier une page',
		description: 'Remplacer le contenu affiche sur le site public par la version editee.',
		sensitive: true
	},

	/*
	 * Infolettre. Deux permissions et non une : la liste des abonnes est la
	 * SEULE donnee directement identifiante du depot (AGENTS.md section 4), et
	 * la consulter n'est pas du meme ordre que l'exporter ou desabonner
	 * quelqu'un a sa place.
	 */
	'newsletter.read': {
		group: 'Infolettre',
		label: 'Consulter les abonnes',
		description: 'Voir le nombre d abonnes et la liste des adresses.'
	},
	'newsletter.manage': {
		group: 'Infolettre',
		label: 'Gerer les abonnes',
		description: 'Exporter la liste et desabonner une adresse.',
		sensitive: true
	},
	'newsletter.send': {
		group: 'Infolettre',
		label: 'Rediger et diffuser les campagnes',
		description:
			'Ecrire une campagne, s en envoyer un essai et la diffuser a toutes les adresses confirmees.',
		sensitive: true
	},

	/*
	 * Messagerie. Aucune de ces permissions ne donne a lire une boite : on lit
	 * sa boite personnelle et celles dont on est membre, rien d'autre.
	 * Administrer les boites, c'est les creer et en choisir les membres.
	 */
	'mail.use': {
		group: 'Messagerie',
		label: 'Utiliser la messagerie',
		description:
			'Lire, envoyer et classer le courrier de sa boite personnelle et des boites partagees dont on est membre.'
	},
	'mail.admin': {
		group: 'Messagerie',
		label: 'Gerer les boites',
		description:
			'Creer une boite partagee ou personnelle, choisir ses membres, designer la boite qui recoit le courrier sans destinataire.',
		sensitive: true
	},

	/*
	 * Planning. Le consulter suffit a declarer SES propres presences et
	 * absences, et a faire avancer les taches qui vous sont confiees : ce sont
	 * des gestes sur soi. Ecrire, c'est poser des rendez-vous, distribuer des
	 * taches et tenir le planning des autres.
	 */
	'planning.read': {
		group: 'Planning',
		label: 'Consulter le planning',
		description:
			'Voir le calendrier de l equipe, declarer ses presences et absences, faire avancer ses taches.'
	},
	'planning.write': {
		group: 'Planning',
		label: 'Organiser le planning',
		description:
			'Poser des evenements, creer et attribuer des taches, saisir les presences et absences des autres membres.'
	},

	'user.read': {
		group: 'Equipe',
		label: 'Consulter les comptes',
		description: 'Voir la liste des membres et leur role.'
	},
	'user.manage': {
		group: 'Equipe',
		label: 'Gerer les comptes',
		description: 'Inviter un membre, desactiver un compte, reinitialiser un acces.',
		sensitive: true
	},
	'role.manage': {
		group: 'Equipe',
		label: 'Gerer les roles',
		description: 'Creer un role et choisir les permissions qu il regroupe.',
		sensitive: true
	},

	'settings.manage': {
		group: 'Administration',
		label: 'Modifier les reglages',
		description: 'Changer les reglages applicatifs, dont le seuil d anonymat.',
		sensitive: true
	},
	'audit.read': {
		group: 'Administration',
		label: 'Consulter le journal',
		description: 'Lire le journal d audit des actions du back-office.'
	}
} as const satisfies Record<string, PermissionDefinition>;

export type Permission = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

/** Vrai si la chaine correspond a une permission actuellement enregistree. */
export function isPermission(value: string): value is Permission {
	return Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}

/**
 * Une permission touche-t-elle a ce qui est publie, ou a qui peut publier ?
 *
 * Accesseur plutot que lecture directe de `.sensitive` : `as const` donne a
 * chaque entree son type litteral, et celles qui ne declarent pas le drapeau
 * n'ont tout simplement pas la propriete.
 */
export function isSensitive(key: Permission): boolean {
	return 'sensitive' in PERMISSIONS[key] && PERMISSIONS[key].sensitive === true;
}

/**
 * Ne conserve que les cles encore connues du registre.
 *
 * Un role peut porter la permission d une fonctionnalite retiree depuis. On
 * l ignore au lieu d echouer : desinstaller une fonctionnalite ne doit pas
 * casser les roles existants, ni accorder un droit qui n existe plus.
 */
export function sanitizePermissions(raw: readonly string[]): Permission[] {
	return raw.filter(isPermission);
}

export interface PermissionHolder {
	readonly permissions: readonly string[];
}

/**
 * Test d appartenance, sans exception ni joker.
 *
 * Il n y a volontairement pas de super-utilisateur implicite : un joker `*`
 * serait un cas particulier a verifier a chaque appel, et c est exactement ce
 * qu on evite (AGENTS.md section 1.2). Le role d administration systeme porte la
 * liste complete des permissions, tenue a jour par le script de synchronisation.
 */
export function can(holder: PermissionHolder | null, permission: Permission): boolean {
	if (!holder) return false;
	return holder.permissions.includes(permission);
}

/** Vrai si le porteur detient au moins une des permissions demandees. */
export function canAny(
	holder: PermissionHolder | null,
	permissions: readonly Permission[]
): boolean {
	if (!holder) return false;
	return permissions.some((permission) => holder.permissions.includes(permission));
}

/** Vrai si le porteur detient toutes les permissions demandees. */
export function canAll(
	holder: PermissionHolder | null,
	permissions: readonly Permission[]
): boolean {
	if (!holder) return false;
	return permissions.every((permission) => holder.permissions.includes(permission));
}

/** Permissions regroupees par intitule de groupe, pour l ecran d edition des roles. */
export function permissionsByGroup(): Map<string, Permission[]> {
	const groups = new Map<string, Permission[]>();

	for (const key of PERMISSION_KEYS) {
		const { group } = PERMISSIONS[key];
		const bucket = groups.get(group);
		if (bucket) {
			bucket.push(key);
			continue;
		}
		groups.set(group, [key]);
	}

	return groups;
}
