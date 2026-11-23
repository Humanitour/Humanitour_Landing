import { formatCount } from '../../format';
import { HERO_PHOTO } from '../../photos';
import { LINKS, PILLARS, QUESTIONS, TOUR } from '../../site';
import { BOURDIEU_BIASES, templateDeck, templateTeam } from './common';
import type { ContentTemplate } from './types';

/**
 * L'accueil, tel qu'il a ete compose.
 *
 * Onze sections, dans l'ordre de lecture : la couverture pose la scene, le
 * tableau oppose le plateau au terrain, les questions disent ce qui a ete
 * demande, la methode dit pourquoi c'etait a velo, le reportage montre ce que
 * ca a produit, l'infolettre propose de suivre la suite, Bourdieu donne le
 * cadre, le cout dit qui paie les sondages des autres, l'equipe repond a la
 * question que cette section pose, les piliers repondent de l'institut, et la
 * cloture propose d'y adherer.
 *
 * Les valeurs chiffrees viennent de `shared/site.ts`, source unique reprise de
 * la plaquette : recopier « 4 000 km » ici en ferait une seconde verite.
 */

/** Ce que l'enquete de terrain a produit (plaquette, section « Le lancement »). */
const FIGURES = [
	{ value: `${formatCount(TOUR.kilometres)} km`, label: 'parcourus à vélo' },
	{ value: String(TOUR.regions), label: 'régions métropolitaines' },
	{ value: formatCount(TOUR.respondents), label: 'français·es interrogé·es' },
	{ value: `${TOUR.months} mois`, label: 'hébergés chez les habitants' }
];

/**
 * Ce que les plateaux mettaient en avant, face a ce que le terrain a repondu.
 *
 * Les deux colonnes ne mesurent pas la meme chose, et c'est le propos : a
 * gauche le traitement mediatique pendant le tour, a droite les reponses des
 * mille personnes rencontrees en face-a-face. Les libelles sont ceux du
 * dossier de l'association, y compris quand ils nomment un rang (« premier
 * sujet ») plutot qu'une part : inventer un pourcentage la ou la source n'en
 * donne pas serait exactement le reproche fait aux autres.
 */
const BROADCAST_VERSUS_GROUND = [
	{ subject: 'Majorité', broadcast: 'Droite', ground: 'Gauche' },
	{ subject: 'Le Pen', broadcast: '35 %', ground: '11 %' },
	{ subject: 'Mélenchon', broadcast: '16 %', ground: '16 %' },
	{ subject: 'Philippe et Attal', broadcast: 'Plus de 15 %', ground: 'Moins de 5 %' },
	{ subject: 'Immigration', broadcast: 'Premier sujet', ground: 'Dernier sujet' }
];

/** Le sondage commande sur fonds publics, meme source. */
const PUBLIC_SPENDING = [
	{
		figure: '9 M€',
		body: "de sondages commandés par l'Élysée sous la présidence de Nicolas Sarkozy, sans mise en concurrence ni transparence, ce qui a entraîné des condamnations pour détournement de fonds publics et favoritisme."
	},
	{
		figure: '3,18 M€',
		body: "pour 87 études et sondages commandés en 2019 par le Service d'information du gouvernement."
	},
	{
		figure: '300',
		body: "sondages publiés pendant la campagne présidentielle de 2022, soit plus d'un par jour, ce qui installe la logique de course de chevaux au détriment des programmes."
	}
];

export const homeTemplate: ContentTemplate = {
	key: 'HOME',
	blocks: [
		{
			type: 'cover',
			data: {
				title: 'Les sondages disent-ils la vérité ?',
				highlight: 'vérité',
				highlightStyle: 'brand',
				intro:
					'Humanitour a vérifié pour vous. Nous avons traversé la France à vélo, pour interroger un échantillon représentatif de la population.',
				figures: FIGURES,
				buttons: [
					{ label: 'Voir les résultats', href: '/donnees', variant: 'brand' },
					{ label: 'Soutenir sur HelloAsso', href: LINKS.helloasso.href, variant: 'inverse' },
					{ label: 'Lire la méthodologie', href: '/methodologie', variant: 'inverse' }
				],
				image: {
					src: HERO_PHOTO.src,
					alt: HERO_PHOTO.alt,
					width: HERO_PHOTO.width,
					height: HERO_PHOTO.height
				},
				accent: 'et oui, aucun milliardaire\nne nous dit quoi faire !',
				fullHeight: 'ecran',
				decor: 'aucun',
				surface: 'ink',
				spacing: 'normal'
			}
		},
		{
			type: 'table',
			data: {
				title: 'Ce qui se dit à la télé vs la réalité du terrain',
				highlight: 'terrain',
				highlightStyle: 'brand',
				caption:
					'Ce que le traitement médiatique mettait en avant, face aux réponses des personnes rencontrées en face-à-face',
				column1: 'Sujet ou candidat',
				column2: 'À la télé',
				column3: 'Sur le terrain',
				rows: BROADCAST_VERSUS_GROUND.map((line) => ({
					entry: line.subject,
					value1: line.broadcast,
					value2: line.ground
				})),
				comment:
					"Les instituts et entreprises de sondages sous-estiment la gauche et surestiment la droite. C'était aussi le cas lors des deux dernières élections présidentielles. Et aux législatives de 2024, tous les sondages projetaient le RN devant, mais c'est l'alliance de gauche qui est arrivée en tête en nombre de sièges, suivie du bloc central, démontrant une mauvaise mesure des dynamiques de barrage.",
				note: `Colonne « À la télé » : ce que les plateaux mettaient en avant pendant le tour. Colonne « Sur le terrain » : les réponses des ${formatCount(TOUR.respondents)} personnes rencontrées en face-à-face, en effectifs bruts, sans pondération ni redressement. Chiffres repris du dossier « Le constat » d'Humanitour.`,
				surface: 'ink',
				spacing: 'suite'
			}
		},
		{
			type: 'steps',
			data: {
				title: "Ce qu'on a demandé",
				intro:
					'Quatre questions, posées dans cet ordre, en face-à-face. La formulation est celle du terrain.',
				items: QUESTIONS.map((question) => ({ text: question })),
				buttons: [{ label: 'Voir les résultats', href: '/donnees', variant: 'primary' }],
				surface: 'paper',
				spacing: 'normal'
			}
		},
		{
			type: 'text',
			data: {
				title: 'Une méthodologie pour éviter les biais',
				highlight: 'biais',
				highlightStyle: 'brand',
				body: 'Les sondages faits sur internet excluent une partie de la population. Nous avons réalisé le premier sondage de terrain, à vélo. Déguisé en coq et aux couleurs de la France, pour parler à tous les français·es.',
				buttons: [{ label: 'Lire la méthodologie', href: '/methodologie', variant: 'outline' }],
				layout: 'colonne',
				surface: 'cream',
				spacing: 'ample'
			}
		},
		{
			type: 'split',
			data: {
				title: 'Un sondage-reportage',
				highlight: 'sondage-reportage',
				highlightStyle: 'brand',
				figures: FIGURES,
				body: "Pour rompre avec l'opacité des sondages, nous allons tout vous partager dans une série documentaire. La quasi-totalité des personnes rencontrées ont accepté de partager leur vote et chaque soir nous avons été hébergés chez les français·es.",
				aside: 'photos',
				asideLink: '/galerie',
				deckPhotos: templateDeck(),
				surface: 'mesh',
				spacing: 'ample'
			}
		},
		{
			type: 'newsletter',
			data: {
				title: 'Être prévenu·e à la sortie',
				intro:
					"Les résultats de l'enquête et la série documentaire seront publiés ici. Laissez votre adresse : nous n'écrivons que lorsqu'il y a quelque chose à lire.",
				surface: 'paper',
				spacing: 'ample'
			}
		},
		{
			type: 'pull-quote',
			data: {
				title: 'Le constat sociologique',
				subtitle: 'Pierre Bourdieu, 1972',
				quote:
					"L'effet fondamental du sondage d'opinion est de constituer l'illusion qu'il existe une opinion publique unanime, pour légitimer une politique.",
				author: 'Pierre Bourdieu, 1980',
				body: 'Bourdieu ne conteste pas la technique du sondage, mais la manière dont il est fabriqué et par qui. Il relève trois biais. Un demi-siècle plus tard, ils sont devenus des méthodes.',
				items: BOURDIEU_BIASES,
				surface: 'cream',
				spacing: 'ample'
			}
		},
		{
			type: 'cards',
			data: {
				title: 'Qui commande les sondages, et à quel prix',
				intro:
					"Un sondage a toujours un commanditaire. Quand c'est l'État, la facture est publique, et elle a déjà valu des condamnations.",
				items: PUBLIC_SPENDING,
				note: "Chiffres repris du dossier « Le constat » d'Humanitour.",
				surface: 'paper',
				spacing: 'ample'
			}
		},
		{
			type: 'team',
			data: {
				title: 'Qui a posé les questions',
				intro:
					'Un institut qui reproche aux autres leur opacité doit pouvoir dire qui il est. Voilà les cinq personnes qui ont monté celui-ci.',
				members: templateTeam(),
				layout: 'ligne',
				moreHref: '/a-propos',
				surface: 'ink',
				spacing: 'ample'
			}
		},
		{
			type: 'definitions',
			data: {
				title: 'Le premier vrai institut de sondage',
				items: PILLARS.map((pillar) => ({ term: pillar.title, body: pillar.body })),
				layout: 'etroite',
				buttons: [
					{ label: 'Lire la méthodologie', href: '/methodologie', variant: 'outline' },
					{ label: 'Auditer le code source', href: LINKS.repository.href, variant: 'ghost' }
				],
				shapes: 'oui',
				surface: 'cream',
				spacing: 'ample'
			}
		},
		{
			type: 'cta',
			data: {
				title: "L'opinion publique n'est pas une marchandise",
				intro:
					'Soutenez Humanitour, pour redonner la parole à chacun·e et le pouvoir aux citoyens.',
				buttons: [
					{ label: 'Soutenir sur HelloAsso', href: LINKS.helloasso.href, variant: 'primary' },
					{ label: 'Rejoindre le Discord', href: LINKS.discord.href, variant: 'outline' },
					{ label: 'S’abonner aux réseaux', href: LINKS.instagram.href, variant: 'ghost' }
				],
				surface: 'brand',
				spacing: 'ample'
			}
		}
	]
};
