import { formatCount } from '../../format';
import { LICENSES, LINKS, RETENTION, TOUR } from '../../site';
import { BOURDIEU_BIASES } from './common';
import type { ContentTemplate } from './types';

/**
 * La methodologie, telle qu'elle a ete composee.
 *
 * Le seuil d'anonymat n'y est pas ecrit en clair : le texte cite `{seuil}`, et
 * le rendu y met la valeur REELLEMENT appliquee, lue en base. Une page qui
 * annoncerait « 5 » pendant que l'agregation en applique un autre serait pire
 * que pas de page du tout — c'est exactement le reproche d'opacite adresse aux
 * instituts.
 */

/**
 * Les trois principes fondamentaux, texte de l'association (septembre 2026).
 *
 * Chacun appelle un geste : proposer une question, repondre a une enquete. Les
 * deux boutons de la section les portent, faute de lien par entree.
 */
const PRINCIPLES = [
	{
		term: 'La démocratie',
		body: "Parce que la démocratie n'a pas de prix, nos questionnaires ne sont pas commandités par des élites économiques, médiatiques ou politiques. Nous intégrons directement les citoyen·ne·s dans le choix des thématiques et la formulation des questions afin que ce soient leurs préoccupations qui dictent l'agenda des médias et des politiques, et non l'inverse."
	},
	{
		term: 'La citoyenneté',
		body: "Parce que chaque voix compte, nous privilégions l'enquête de terrain pour inclure l'ensemble de la population, y compris les personnes éloignées du numérique et de la politique. La démarche d'« aller vers » nous permet de considérer les invisibles, d'inclure toutes les générations, de traverser toutes les zones d'habitation, tout en diversifiant les lieux (au domicile, dans la rue, les centres commerciaux, à la sortie du travail…). En plus du tour de France à vélo, le projet est de développer un réseau de référents locaux, et une plateforme citoyenne de sondage pour permettre à chacun·e de s'exprimer régulièrement."
	},
	{
		term: "L'humain",
		body: "L'être humain ne se résume pas à une case ou à un pourcentage. Humanitour invente le sondage-reportage : une prolongation du questionnaire statistique en documentaire audio et vidéo. Donner la parole permet de mesurer le niveau d'engagement des répondants. Les témoignages en image et en son facilitent l'écoute, la compréhension mutuelle et la réflexion intellectuelle. Et la documentation des sondages permet une plus grande transparence."
	}
];

/** Ce que ces principes engagent, meme texte. */
const COMMITMENTS = [
	{
		term: 'Des résultats contextualisés',
		body: "L'alliance entre sondage statistique et reportage de terrain remet les chiffres dans leur contexte sociologique. Aucun sondage ne détient de vérité absolue, et les écarts majeurs entre nos données de terrain et celles des sondages en ligne en apportent la preuve. Là où les sondages numériques fabriquent une illusion d'unanimité, en invisibilisant les sans-opinion et en forçant un choix artificiel, nous prenons réellement en compte les non-réponses et les « je ne sais pas ». L'abstention et l'indécision sont des indicateurs sociologiques clés que nous mesurons. Nous expérimentons de nouvelles approches de terrain pour nous rapprocher au plus près du réel."
	},
	{
		term: 'Transparence intégrale',
		body: "Chez la majorité des entreprises de sondage, les données brutes et les algorithmes de redressement restent secrets, empêchant les citoyens et les chercheurs de vérifier comment un chiffre a été fabriqué. Humanitour est le seul institut à faire le choix de la transparence intégrale. Vous avez accès à nos données brutes et, lorsque nous appliquons des pondérations statistiques, nos méthodes sont publiées en toute clarté. En rendant le matériau brut et le processus de calcul entièrement vérifiables, nous redonnons au sondage son statut d'outil scientifique ouvert et digne de confiance."
	},
	{
		term: 'Éthique et sécurité des données',
		body: "En tant qu'institut à but non lucratif, nous ne commercialisons aucune donnée personnelle. Nous développons des plateformes numériques sécurisées et indépendantes. Les résultats de nos enquêtes sont anonymisés et mis à disposition des chercheurs, des citoyens et des acteurs de la société civile en accès libre (open data)."
	},
	{
		term: 'Impartialité et indépendance',
		body: "En sciences humaines, la neutralité absolue n'existe pas. Mais là où les instituts traditionnels prétendent à une « neutralité » de façade tout en répondant aux impératifs financiers de leurs commanditaires, Humanitour fait le choix d'une indépendance totale. Nos sondeurs n'ont aucun résultat à « vendre » ou à fabriquer. Ils adoptent une posture d'écoute, pour offrir un espace où chaque citoyen·ne se sent légitime et libre de s'exprimer."
	}
];

const REUTILISATION_BODY = {
	blocks: [
		{
			type: 'paragraph',
			items: [
				[
					{ text: 'Les données publiées sont sous ' },
					{ text: LICENSES.data.name, href: LICENSES.data.url },
					{ text: " : réutilisation libre, attribution obligatoire, partage à l'identique." }
				]
			]
		},
		{
			type: 'paragraph',
			items: [
				[
					{ text: 'La plateforme elle-même est sous ' },
					{ text: LICENSES.code.name, href: LICENSES.code.url },
					{
						text: '. Quiconque en héberge une version modifiée doit en publier le code : un outil qui dénonce l’opacité ne peut pas être refermable.'
					}
				]
			]
		}
	]
};

export const methodTemplate: ContentTemplate = {
	key: 'METHOD',
	blocks: [
		{
			type: 'cover',
			data: {
				title: 'Une approche scientifique et humaine du sondage',
				highlight: 'humaine',
				highlightStyle: 'brand',
				intro:
					"Les entreprises de sondage répondent avant tout à des impératifs économiques. En tant qu'institut citoyen et à but non lucratif, notre priorité n'est pas le rendement, mais le respect des êtres humains et des sciences sociales.",
				buttons: [{ label: 'Voir les résultats', href: '/donnees', variant: 'primary' }],
				fullHeight: 'contenu',
				decor: 'aucun',
				surface: 'paper',
				spacing: 'normal'
			}
		},
		{
			type: 'figure-grid',
			data: {
				items: [
					{
						value: `${formatCount(TOUR.kilometres)} km`,
						label: 'À vélo',
						hint: 'À travers les régions métropolitaines'
					},
					{
						value: `${TOUR.months} mois`,
						label: 'Sur le terrain',
						hint: 'En continu, au contact des habitants'
					},
					{
						value: String(TOUR.regions),
						label: 'Régions',
						hint: 'Toutes les métropolitaines, Corse comprise'
					},
					{
						value: formatCount(TOUR.respondents),
						label: 'Personnes',
						hint: 'Rencontrées en face-à-face'
					}
				],
				columns: '4',
				style: 'affiche',
				surface: 'ink',
				spacing: 'compact'
			}
		},
		{
			type: 'definitions',
			data: {
				title: 'Le terrain plutôt que les panels en ligne',
				items: [
					{
						term: 'Aucun panel, aucun courriel',
						body: "Les instituts privés recrutent en ligne, auprès de volontaires déjà inscrits et rémunérés en bons d'achat. Le vélo a imposé l'inverse : les gens ont été rencontrés là où ils vivent, sans présélection."
					},
					{
						term: 'La France entière, pas les métropoles',
						body: "Un sondage par courriel surreprésente les grandes villes connectées. Le parcours a traversé les bourgs et les zones rurales que les panels en ligne n'atteignent jamais."
					},
					{
						term: 'Des échanges documentés',
						body: "Chaque entretien a été enregistré avec l'accord de la personne, pour donner à entendre les voix derrière les pourcentages et pas seulement le chiffre final."
					}
				],
				layout: 'large',
				shapes: 'oui',
				surface: 'cream',
				spacing: 'ample'
			}
		},
		{
			type: 'embed',
			data: {
				title: 'Treize régions, aucune laissée de côté',
				content: 'carte',
				subtitle: 'Le carnet de route, étape par étape',
				secondContent: 'carnet',
				surface: 'paper',
				spacing: 'ample'
			}
		},
		{
			type: 'pull-quote',
			data: {
				title: 'Notre inspiration sociologique',
				quote: "L'opinion publique n'existe pas.",
				author: 'Pierre Bourdieu',
				body: 'Bourdieu ne conteste pas la technique du sondage, mais la manière dont il est fabriqué et par qui. Il relève trois biais. Un demi-siècle plus tard, ils sont devenus des méthodes.',
				items: BOURDIEU_BIASES,
				surface: 'cream',
				spacing: 'compact'
			}
		},
		{
			type: 'definitions',
			data: {
				title: 'Nos trois principes fondamentaux',
				items: PRINCIPLES,
				layout: 'large',
				buttons: [
					{
						label: 'Proposer les prochaines questions',
						href: LINKS.discord.href,
						variant: 'primary'
					},
					{ label: 'Partager son avis : un geste citoyen', href: '/repondre', variant: 'outline' }
				],
				surface: 'paper',
				spacing: 'compact'
			}
		},
		{
			type: 'definitions',
			data: {
				title: 'Nos engagements',
				items: COMMITMENTS,
				layout: 'large',
				surface: 'cream',
				spacing: 'compact'
			}
		},
		{
			type: 'text',
			data: {
				title: 'Pourquoi certaines cases sont masquées',
				body: "Une opinion politique est une donnée sensible au sens du RGPD. Croiser une région, une tranche d'âge, une profession et une intention de vote peut suffire à reconnaître quelqu'un dans une petite commune. Deux protections s'appliquent donc.",
				items: [
					{
						term: "Le seuil d'effectif",
						body: 'Toute case portant sur moins de {seuil} répondants n’est pas publiée. Elle s’affiche comme « effectif insuffisant » au lieu du chiffre.'
					},
					{
						term: 'La protection contre la soustraction',
						body: "Masquer une seule case ne sert à rien : elle se retrouve en soustrayant les autres du total. Quand c'est le cas, une seconde case est masquée. Sans cette deuxième passe, le masquage donne l'illusion de la protection."
					}
				],
				note: 'Les exports bruts suivent la même logique : ils contiennent les tranches et non les valeurs exactes, et les réponses en texte libre en sont exclues, parce qu’un verbatim identifie son auteur par son contenu.',
				surface: 'ink',
				spacing: 'compact'
			}
		},
		{
			type: 'split',
			data: {
				title: 'Réutilisation',
				body: REUTILISATION_BODY,
				buttons: [
					{ label: 'Voir les données', href: '/donnees', variant: 'primary' },
					{ label: 'Auditer le code', href: LINKS.repository.href, variant: 'outline' }
				],
				aside: 'liste',
				asideSide: 'gauche',
				itemsTitle: 'Conservation',
				itemsLayout: 'bord-a-bord',
				items: [
					{ term: "Réponses brutes d'enquête", value: `${RETENTION.rawSurveyMonths} mois` },
					{ term: 'Notes de méthodologie', value: `${RETENTION.methodologyYears} ans` },
					{ term: 'Sessions de connexion', value: `${RETENTION.sessionDays} jours` },
					{ term: 'Comptes inactifs', value: `${RETENTION.inactiveAccountMonths} mois` }
				],
				surface: 'paper',
				spacing: 'ample'
			}
		}
	]
};
