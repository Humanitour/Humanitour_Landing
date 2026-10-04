/**
 * Couleurs des graphiques.
 *
 * Palette VALIDEE, pas choisie a l oeil. Verifiee avec le validateur de la
 * methode de dataviz sur la surface papier (#FFFFFF), en paires adjacentes :
 *
 *   Bande de clarte      PASS  — les 8 dans L 0.43–0.77
 *   Plancher de chroma   PASS  — les 8 >= 0.1
 *   Separation daltonien PASS  — pire paire #e86fa6/#0f8a6c dE 8.7 (protan)
 *   Vision normale       PASS  — pire paire #9c2f5c/#b8860b dE 25.2
 *   Contraste / surface  WARN  — #ff751f et #e86fa6 sous 3:1, d ou la regle ci-dessous
 *
 * Revue le 4 octobre 2026 : la palette precedente etait la palette de
 * reference de la methode, a peine retouchee, et les exports ne portaient de
 * la charte que leur premier slot. Les trois teintes de la charte (corail,
 * orange, rose) y ont maintenant chacune leur place, intercalees avec des
 * teintes froides et sombres qui les separent : poses cote a cote, corail,
 * orange et rose ne se distinguent pas.
 *
 * Le WARN de contraste impose une compensation, appliquee partout : chaque
 * modalite porte son libelle et son effectif en toutes lettres, et un tableau de
 * donnees accompagne chaque graphique. La couleur n est jamais le seul porteur
 * d information.
 */

/**
 * Slots categoriels, dans un ORDRE FIXE.
 *
 * L ordre ne tourne pas : une modalite garde sa couleur quels que soient les
 * filtres appliques. Filtrer une region ne doit pas repeindre les autres, sinon
 * deux captures du meme sondage ne se comparent plus.
 *
 * Le corail de la marque occupe le premier slot. L orange et le rose de la
 * charte viennent ensuite, chacun encadre par une teinte froide ou sombre :
 * c est l ordre qui passe le validateur en paires adjacentes.
 */
export const CATEGORICAL: readonly string[] = [
	'#FF5757', // corail — charte
	'#1f6fb0', // bleu encre
	'#ff751f', // orange — charte
	'#0f8a6c', // vert d eau
	'#e86fa6', // rose — charte, assombri pour tenir la bande de clarte
	'#5b48a6', // violet
	'#b8860b', // ocre
	'#9c2f5c' // prune
];

/**
 * Plafond pour les formes ou toutes les paires se cotoient : carte categorielle,
 * nuage de points, petits multiples.
 *
 * Hors adjacence, le corail ne se distingue ni de l orange ni du rose (dE 8,3
 * et 10,7 en vision normale, sous le plancher de 15). Ce trio-ci passe toutes
 * les paires, daltonisme compris (pire dE 13,9). Au-dela de trois series sur
 * ces formes, on regroupe en « Autre » ou on separe en plusieurs graphiques.
 */
export const ALL_PAIRS_SAFE: readonly string[] = ['#FF5757', '#1f6fb0', '#9c2f5c'];
export const ALL_PAIRS_MAX = 3;

/**
 * Couleur de la non-reponse.
 *
 * Un gris neutre, reserve, jamais attribue a une modalite ordinaire. La
 * non-reponse est comptee comme les autres — c est la regle du projet — mais
 * elle n est pas une opinion : lui donner une teinte de la palette la ferait lire
 * comme un camp de plus.
 */
export const NON_RESPONSE_COLOR = '#9a9a9a';

/** Couleur d une case masquee par le seuil d anonymat. */
export const SUPPRESSED_COLOR = '#d9d9d9';

/**
 * Rampe sequentielle, teinte unique, du clair au fonce.
 *
 * Sert a la magnitude : carte choroplethe, intensite d une case de tableau
 * croise. Une seule teinte, jamais un arc-en-ciel — la clarte doit se lire comme
 * une quantite.
 */
export const SEQUENTIAL: readonly string[] = [
	'#fff1f1',
	'#ffdede',
	'#ffbfbf',
	'#ff9a9a',
	'#FF5757',
	'#ed3b3b',
	'#c52727'
];

/**
 * Couleur d une modalite.
 *
 * Trois regles, dans cet ordre :
 *   1. la non-reponse a sa couleur reservee ;
 *   2. une couleur imposee en base gagne — c est ce qui permet de respecter les
 *      couleurs conventionnelles des nuances politiques, que le lecteur attend ;
 *   3. sinon, le slot categoriel correspondant a la position.
 *
 * Au-dela de huit modalites les couleurs se repeteraient : `colorAt` ne cycle pas
 * silencieusement, il rend le gris de repli. Une question a plus de huit
 * modalites doit etre regroupee, pas coloriee au hasard.
 */
export function colorFor(
	index: number,
	options: { isNonResponse?: boolean; override?: string | null } = {}
): string {
	if (options.isNonResponse) return NON_RESPONSE_COLOR;
	if (options.override) return options.override;
	return CATEGORICAL[index] ?? NON_RESPONSE_COLOR;
}

/** Vrai si le nombre de modalites depasse ce que la palette peut distinguer. */
export function exceedsPalette(count: number): boolean {
	return count > CATEGORICAL.length;
}

/** Etape de la rampe sequentielle pour une valeur entre 0 et 1. */
export function sequentialStep(ratio: number): string {
	if (!Number.isFinite(ratio) || ratio <= 0) return SEQUENTIAL[0]!;
	const index = Math.min(SEQUENTIAL.length - 1, Math.floor(ratio * SEQUENTIAL.length));
	return SEQUENTIAL[index]!;
}

/**
 * Emplacement de couleur de chaque modalite, fige sur l ordre DECLARE.
 *
 * Sans cela, la couleur suivrait la position a l ecran : trier par effectif ou
 * masquer la non-reponse repeindrait tout le graphique, et deux captures de la
 * meme enquete ne seraient plus comparables. C est exactement ce que
 * l avertissement en tete de `CATEGORICAL` interdit.
 */
export function colorSlots(
	modalities: readonly { readonly key: string }[]
): Readonly<Record<string, number>> {
	const slots: Record<string, number> = {};
	modalities.forEach((modality, index) => {
		slots[modality.key] = index;
	});

	return slots;
}
