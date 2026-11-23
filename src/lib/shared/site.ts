/**
 * Identite de l association et liens sortants.
 *
 * Source unique : ces valeurs alimentent les mentions legales, le pied de page,
 * les metadonnees Open Graph et les appels au don. Les recopier ailleurs, c est
 * garantir qu elles divergeront.
 *
 * Les `slug` et les `href` restent en ASCII : ce sont des adresses, pas du
 * texte. Seuls les libelles portent les accents.
 */

export const SITE = {
	name: 'Humanitour',
	tagline: 'le sondage sans détour',
	description:
		'Un institut de sondage citoyen : 4 000 kilomètres à vélo, 1 000 personnes rencontrées en face-à-face, et la totalité des données brutes publiées.',
	email: 'contact@humanitour.fr',
	domain: 'humanitour.fr'
} as const;

/**
 * Ce que la premiere enquete de terrain a produit.
 *
 * Source unique : la plaquette de l association (`docs/sources/`, section
 * « Le lancement »). Chaque valeur y est ecrite noir sur blanc. Aucun de ces
 * nombres n est estime, arrondi a la hausse ou reconstitue : un chiffre sans
 * source ne s affiche pas, c est la regle que l institut reproche aux autres
 * de ne pas tenir.
 */
export const TOUR = {
	kilometres: 4000,
	months: 2,
	regions: 13,
	/** Personnes rencontrees en face-a-face pendant les deux mois. */
	respondents: 1000,
	/** Part des personnes rencontrees ayant accepte de partager leur vote. */
	voteSharedRatio: '7 sur 10',
	/** Part ayant accepte de repondre face camera. */
	onCameraRatio: "près d'un quart",
	/** L echeance que l enquete documente. */
	election: 'présidentielle 2027'
} as const;

/**
 * Les quatre questions, dans l ordre exact de passation sur le terrain.
 *
 * Le libelle est celui qui a ete pose, pas une reformulation editoriale : la
 * formulation fait partie du resultat (AGENTS.md § 0). Le futur des questions 2
 * et 3 est celui du questionnaire, pose avant le scrutin.
 */
export const QUESTIONS = [
	'Quel sujet vous tient le plus à cœur ?',
	'Au premier tour, pour qui voterez-vous ?',
	'Au second tour, contre qui voterez-vous ?',
	'Pour vous informer, quels médias consultez-vous ?'
] as const;

/**
 * L equipe de l association.
 *
 * Noms, fonctions et notices sont repris MOT POUR MOT de la plaquette
 * (`source/Humanitour.pdf`, page « L equipe ») pour les membres qui y
 * figurent ; Marie Angèle Gicquel a rejoint l equipe apres cette plaquette,
 * sa fiche vient directement de l association. Ce sont des personnes
 * reelles : rien ici ne s invente ni ne se reformule sans leur accord.
 *
 * Les portraits viennent de la meme page et sont stockes dans
 * `static/equipe/`. Le visuel de l incubateur, lui, n a pas ete repris : c est
 * une image de communication de TAG BZH, pas une image de l association
 * (AGENTS.md § 6, pas d image sous droits).
 */
export interface TeamMember {
	readonly slug: string;
	readonly name: string;
	readonly role: string;
	readonly bio: string;
	/**
	 * Site personnel, quand la personne en a un et accepte qu il soit publie.
	 * Optionnel : l absence de champ ne dit rien de plus que l absence de site,
	 * et les fiches restent identiques par ailleurs.
	 */
	readonly website?: string;
}

/*
 * Type explicite et non `as const satisfies` : avec la narration litterale, un
 * champ optionnel present sur une seule fiche (`website`) n existe pas sur le
 * type des trois autres, et toute lecture uniforme de la liste echoue.
 */
export const TEAM: readonly TeamMember[] = [
	{
		slug: 'come-moudenner',
		name: 'Côme Moudenner',
		role: 'Référent des sondages',
		bio: 'Entrepreneur social et aventurier, il expérimente nos méthodologies de terrain.'
	},
	{
		slug: 'elouan-passereau',
		name: 'Elouan Passereau',
		role: 'Référent du numérique',
		bio: 'Informaticien, il développe la première plateforme numérique de sondage citoyenne, indépendante et sécurisée.',
		website: 'https://klaynight.fr'
	},
	{
		slug: 'jeanne-tardivel',
		name: 'Jeanne Tardivel',
		role: 'Référente communication',
		bio: "Créative, elle façonne l'identité visuelle et l'univers d'Humanitour."
	},
	{
		slug: 'mareva-vaucher',
		name: 'Mareva Vaucher',
		role: 'Référente anthropologie',
		bio: "Anthropologue, elle apporte sa fine connaissance de l'humain et des territoires ultramarins."
	},
	{
		// Rejointe apres la plaquette d origine (source/Humanitour.pdf). Les notices
		// de toute l equipe viennent du texte « L'institut » de septembre 2026.
		slug: 'marie-angele-gicquel',
		name: 'Marie Angèle Gicquel',
		role: 'Référente sociologie',
		bio: 'Étudiante en sociologie et en mode, elle analyse nos enquêtes de terrains.'
	}
];

/** L incubateur qui heberge le projet. Meme source. */
export const INCUBATOR = {
	name: "TAG 22, RICH'ESS",
	label: 'Incubateur ESS',
	body: "Humanitour a été sélectionné pour intégrer l'incubateur ESS Bretagne, au Totem de l'innovation, à Saint-Brieuc."
} as const;

/**
 * Les quatre piliers de l association, tels que reformules par Côme Moudenner
 * (référent des sondages) le 20 septembre 2026 pour la section d accueil
 * « Le premier vrai institut de sondage ».
 *
 * Remplace l ancienne liste a cinq entrees, reprise mot pour mot de la
 * plaquette : celle-ci ecrivait « ponderer et contextualiser les resultats »,
 * explicitement exclu par AGENTS.md § 6. La formulation courte, validee par
 * l association elle-meme, n a plus ce probleme.
 */
export const PILLARS = [
	{
		title: 'Citoyen',
		body: 'Humanitour vous appartient. Adhérez ! Nous sommes une association à but non lucratif.'
	},
	{
		title: 'Humain',
		body: 'Nos sondages se font aussi sur le terrain, pour inclure toute la population.'
	},
	{
		title: 'Indépendant',
		body: 'Les questions sont choisies par les citoyens, et non par les médias ou les politiques.'
	},
	{
		title: 'Transparent',
		body: 'Les méthodes, données et témoignages partagés en toute transparence.'
	}
] as const;

/** Association declaree. Valeurs reprises des mentions legales publiees. */
export const ORGANISATION = {
	legalName: 'HUMANITOUR',
	form: 'Association déclarée régie par la loi du 1er juillet 1901',
	rna: 'W224012149',
	address: '9 lieu-dit Kersaint, 22120 Hillion, France',
	declaration:
		"Déclarée à la préfecture des Côtes-d'Armor le 23 août 2026, récépissé n° W224012149 délivré le 7 septembre 2026",
	publicationDirector: 'Elouan Passereau'
} as const;

export const HOST = {
	name: 'WinHeberg',
	address: 'Rue Chaussade, Bâtiment 2, 43260 Saint-Julien-Chapteuil, France',
	phone: '+33 9 72 14 79 11',
	website: 'https://winheberg.com',
	dataCenter: 'nLighten Lyon LYS1, Villeurbanne, France'
} as const;

export const POLLING = {
	code: "code international ICC/ESOMAR des études de marché, d'opinion et sociales",
	commissionUrl: 'https://www.commission-des-sondages.fr'
} as const;

export const LICENSES = {
	code: { name: 'AGPL-3.0', url: 'https://www.gnu.org/licenses/agpl-3.0.html' },
	data: { name: 'ODbL 1.0', url: 'https://opendatacommons.org/licenses/odbl/1-0/' }
} as const;

export interface ExternalLink {
	readonly label: string;
	readonly href: string;
	readonly description?: string;
}

export const LINKS = {
	discord: {
		label: 'Discord',
		href: 'https://discord.gg/qdFMQFUZ5M',
		description: 'Rejoins la communauté et suis le tour en direct.'
	},
	instagram: {
		label: 'Instagram',
		href: 'https://www.instagram.com/humanitour.france/',
		description: 'Suis le tour et les coulisses en photos.'
	},
	helloasso: {
		label: 'HelloAsso',
		href: 'https://www.helloasso.com/associations/humanitour/collectes/le-premier-institut-de-sondage-citoyen',
		description: "Soutiens le projet et participe à la collecte sur HelloAsso."
	},
	/**
	 * Le carnet de route du tour. L adresse est celle du voyage public, sans le
	 * suffixe `/embed` : c est celle qu on donne a un visiteur. Le cadre de
	 * `PolarstepsEmbed.svelte` ajoute le suffixe lui-meme, pour que les deux ne
	 * puissent pas designer deux voyages differents.
	 */
	polarsteps: {
		label: 'Polarsteps',
		href: 'https://www.polarsteps.com/Humanitour/27139019-l-aventure-commence',
		description: 'Le carnet de route du tour, étape par étape.'
	},
	forms: {
		label: 'Répondre au sondage',
		href: 'https://forms.humanitour.fr',
		description: 'Le formulaire de collecte.'
	},
	repository: {
		label: 'Code source',
		href: 'https://github.com/Klaynight-dev/Humanitour_Landing',
		description: 'La plateforme est libre et auditable.'
	}
} as const satisfies Record<string, ExternalLink>;

export const LEGAL_PAGES = [
	{ slug: 'mentions-legales', label: 'Mentions légales', short: 'Mentions légales' },
	{ slug: 'cgu', label: "Conditions générales d'utilisation", short: 'CGU' },
	{ slug: 'confidentialite', label: 'Politique de confidentialité', short: 'Confidentialité' },
	{ slug: 'cookies', label: 'Gestion des cookies', short: 'Cookies' },
	{ slug: 'deontologie', label: 'Déontologie des sondages', short: 'Déontologie' }
] as const;

/** Durees de conservation annoncees, en clair, dans la politique de confidentialite. */
export const RETENTION = {
	sessionDays: 7,
	rawSurveyMonths: 24,
	inactiveAccountMonths: 24,
	methodologyYears: 5
} as const;

/**
 * Navigation principale.
 *
 * Ne contient que des routes existantes : un menu qui promet une page absente
 * coute plus cher en confiance qu'une rubrique manquante.
 */
export const NAV = [
	{ href: '/', label: 'Accueil' },
	{ href: '/donnees', label: 'Résultats' },
	{ href: '/methodologie', label: 'Méthode' },
	{ href: '/a-propos', label: "L'institut" },
	{ href: '/participer', label: 'Participer' }
] as const;
