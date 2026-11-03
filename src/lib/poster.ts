/**
 * L affiche : un resultat exporte en image, habille de la charte.
 *
 * Une image de graphique circule sans sa page. Elle doit donc emporter avec
 * elle tout ce qui la rend lisible et verifiable : la question EXACTE, la base,
 * la periode de terrain, la licence et l adresse ou la refaire. Un graphique
 * qui voyage sans sa base est exactement ce que l association reproche aux
 * autres (`AGENTS.md` section 0).
 *
 * Elle est composee dans le navigateur, sur un canvas, a partir du PNG rendu
 * par ECharts. Aucune dependance de plus, et aucun rasteriseur a installer sur
 * le serveur.
 */

/** Largeur de l affiche. Deux fois la largeur de lecture : nette en projection. */
export const POSTER_WIDTH = 1200;
const PADDING = 56;
const HEADER_PADDING = 44;
const TITLE_SIZE = 42;
const TITLE_LINE = 52;
const SURVEY_SIZE = 20;
const FOOTER_SIZE = 19;
const FOOTER_LINE = 30;

/** Un graphique rendu en image, avec les mesures qui servent a le replacer. */
export interface PosterChart {
	readonly dataUrl: string;
	readonly width: number;
	readonly height: number;
}

/**
 * Un tableau croise, a dessiner sur l affiche.
 *
 * Le tableau n est pas un graphique ECharts : il n a pas d image a exporter, il
 * faut le tracer. Les valeurs arrivent DEJA composees (« 30,4 % (123) », ou le
 * tiret des cases masquees) : la mise en forme des chiffres reste celle de
 * `shared/format.ts`, y compris dans une image.
 */
export interface PosterTable {
	/** En-tetes de colonnes, la premiere cellule etant le coin du tableau. */
	readonly columns: readonly string[];
	readonly rows: readonly { readonly header: string; readonly cells: readonly string[] }[];
}

/**
 * Les qualites d export proposees a l utilisateur.
 *
 * `scale` grandit le canvas final (`composePoster`), `pixelRatio` grandit la
 * nettete du graphique source avant qu il n y soit colle (`EChart.toPng`) :
 * sans les deux ensemble, une affiche « impression » agrandirait un
 * graphique deja flou plutot que d en tirer un plus net.
 */
export type PosterQuality = 'ecran' | 'impression';

export const POSTER_QUALITIES: Record<
	PosterQuality,
	{ readonly label: string; readonly scale: number; readonly pixelRatio: number }
> = {
	ecran: { label: 'Écran', scale: 2, pixelRatio: 3 },
	impression: { label: 'Impression', scale: 3, pixelRatio: 4 }
};

export interface PosterContent {
	readonly surveyTitle: string;
	/** Libelle exact de la question. */
	readonly question: string;
	readonly crossedWith: string | null;
	readonly base: string;
	readonly fieldwork: string;
	readonly licence: string;
	readonly url: string;
	/** Le graphique rendu par ECharts, ou le tableau a tracer. Jamais les deux. */
	readonly chart: PosterChart | null;
	readonly table: PosterTable | null;
}

/** Mesure d une chaine, injectee pour que la mise en page se teste sans canvas. */
export type Measure = (text: string) => number;

/**
 * Coupe un texte en lignes qui tiennent dans la largeur.
 *
 * Un mot plus large que la ligne occupe sa propre ligne plutot que d etre
 * tronque : le libelle d une question ne se coupe pas, il fait partie du
 * resultat.
 */
export function wrapLines(text: string, maxWidth: number, measure: Measure): readonly string[] {
	const words = text.split(/\s+/).filter(Boolean);
	if (words.length === 0) return [];

	const lines: string[] = [];
	let current = '';

	for (const word of words) {
		const candidate = current === '' ? word : `${current} ${word}`;
		if (current !== '' && measure(candidate) > maxWidth) {
			lines.push(current);
			current = word;
			continue;
		}
		current = candidate;
	}

	lines.push(current);
	return lines;
}

const TABLE_ROW = 40;
const TABLE_HEADER = 48;
const TABLE_FONT = 17;

/**
 * Hauteur occupee par un tableau.
 *
 * Elle suit le nombre de lignes : un tableau a douze modalites ne tient pas
 * dans la place d un tableau binaire, et le comprimer rendrait les chiffres
 * illisibles a l impression.
 */
export function tableHeight(rowCount: number): number {
	return TABLE_HEADER + rowCount * TABLE_ROW;
}

/**
 * Largeurs de colonnes.
 *
 * La premiere porte des libelles de modalites, les autres des chiffres : elle
 * recoit donc le double. Sans cela, « Les retraites et les pensions » se
 * retrouve a l etroit pendant que « 4,6 % » nage dans sa colonne.
 */
export function columnWidths(totalWidth: number, columnCount: number): readonly number[] {
	if (columnCount <= 0) return [];
	if (columnCount === 1) return [totalWidth];

	const unit = totalWidth / (columnCount + 1);
	return [unit * 2, ...Array.from({ length: columnCount - 1 }, () => unit)];
}

export interface PosterLayout {
	readonly width: number;
	readonly height: number;
	readonly headerHeight: number;
	readonly chart: {
		readonly x: number;
		readonly y: number;
		readonly width: number;
		readonly height: number;
	};
	readonly footerY: number;
}

/**
 * Place les trois blocs de l affiche.
 *
 * Le graphique garde ses PROPORTIONS : l etirer pour remplir une hauteur fixe
 * fausserait la lecture des longueurs, ce qui est le seul mensonge qu un
 * graphique a barres puisse raconter.
 */
export function posterLayout(
	titleLines: number,
	footerLines: number,
	body: { width: number; height: number; keepRatio?: boolean }
): PosterLayout {
	const headerHeight = HEADER_PADDING * 2 + SURVEY_SIZE + 16 + titleLines * TITLE_LINE;

	const chartWidth = POSTER_WIDTH - PADDING * 2;
	// Un graphique garde ses proportions ; un tableau, lui, porte deja sa
	// hauteur exacte et l etirer decollerait les lignes de leurs libelles.
	const chartHeight =
		body.keepRatio === false
			? Math.round(body.height)
			: Math.round((body.height / body.width) * chartWidth);
	const footerHeight = PADDING + footerLines * FOOTER_LINE + PADDING;

	return {
		width: POSTER_WIDTH,
		height: headerHeight + PADDING + chartHeight + footerHeight,
		headerHeight,
		chart: { x: PADDING, y: headerHeight + PADDING, width: chartWidth, height: chartHeight },
		footerY: headerHeight + PADDING + chartHeight + PADDING
	};
}

/** Les lignes de pied de page, dans l ordre ou elles doivent se lire. */
export function footerLines(content: PosterContent): readonly string[] {
	const context = [content.base, content.fieldwork].filter(Boolean).join(' · ');

	return [
		context,
		`Effectifs bruts, sans pondération ni redressement · ${content.licence}`,
		content.url
	].filter((line) => line.trim() !== '');
}

/**
 * Trace le tableau croise.
 *
 * Meme contenu que le tableau de la page : la part en ligne, son effectif, et
 * le tiret des cases que le seuil d anonymat masque. Un tableau exporte qui
 * afficherait un zero la ou la page affiche un tiret publierait un chiffre que
 * la page refuse de publier.
 */
function drawTable(
	ctx: CanvasRenderingContext2D,
	table: PosterTable,
	area: { x: number; y: number; width: number }
): void {
	const widths = columnWidths(area.width, table.columns.length);
	const offsets = widths.reduce<number[]>(
		(positions, width, index) => [...positions, (positions[index] ?? area.x) + width],
		[area.x]
	);

	ctx.textBaseline = 'middle';

	// En-tete : sur l aplat creme de la charte, texte noir.
	ctx.fillStyle = '#fff1eb';
	ctx.fillRect(area.x, area.y, area.width, TABLE_HEADER);
	ctx.fillStyle = '#000000';
	ctx.font = `600 ${TABLE_FONT}px ${SANS}`;

	table.columns.forEach((column, index) => {
		const left = offsets[index] ?? area.x;
		const width = widths[index] ?? 0;
		const middle = area.y + TABLE_HEADER / 2;
		// La premiere colonne porte des libelles, les autres des chiffres :
		// alignes a droite, ils se comparent d une ligne a l autre.
		if (index === 0) ctx.textAlign = 'left';
		else ctx.textAlign = 'right';
		ctx.fillText(column, index === 0 ? left + 12 : left + width - 12, middle, width - 24);
	});

	table.rows.forEach((row, rowIndex) => {
		const top = area.y + TABLE_HEADER + rowIndex * TABLE_ROW;
		const middle = top + TABLE_ROW / 2;

		ctx.strokeStyle = '#dcd8d6';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(area.x, top);
		ctx.lineTo(area.x + area.width, top);
		ctx.stroke();

		ctx.fillStyle = '#000000';
		ctx.textAlign = 'left';
		ctx.font = `500 ${TABLE_FONT}px ${SANS}`;
		ctx.fillText(row.header, area.x + 12, middle, (widths[0] ?? 0) - 24);

		ctx.textAlign = 'right';
		ctx.font = `400 ${TABLE_FONT}px ${SANS}`;
		row.cells.forEach((cell, index) => {
			const column = index + 1;
			const left = offsets[column] ?? area.x;
			const width = widths[column] ?? 0;
			ctx.fillText(cell, left + width - 12, middle, width - 24);
		});
	});

	ctx.textAlign = 'left';
	ctx.textBaseline = 'top';
}

function loadImage(source: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error(`Image illisible : ${source}`));
		image.src = source;
	});
}

/** Le degrade de marque, dans l ordre de la charte. */
function brandGradient(ctx: CanvasRenderingContext2D, width: number, height: number) {
	const gradient = ctx.createLinearGradient(0, 0, width, height);
	gradient.addColorStop(0, '#ffffff');
	gradient.addColorStop(0.38, '#ff5757');
	gradient.addColorStop(0.68, '#ff88b7');
	gradient.addColorStop(1, '#ff751f');
	return gradient;
}

const SANS = "'Jost Variable', ui-sans-serif, system-ui, sans-serif";

/**
 * Compose l affiche et rend le PNG.
 *
 * Le texte est NOIR sur le degrade, jamais blanc : blanc sur l orange de la
 * charte ne donne que 2,69:1 (`app.css`). C est la seule combinaison lisible,
 * et elle vaut aussi en image.
 *
 * `scale` grandit la resolution du PNG sans rien changer a la mise en page :
 * la mise en page reste en pixels logiques (`posterLayout` etc.), seul le
 * canvas final est agrandi, comme un `devicePixelRatio` choisi a la main.
 * Une affiche destinee a l impression en a besoin, une affiche partagee a
 * l ecran non.
 */
export async function composePoster(
	content: PosterContent,
	logoUrl?: string,
	scale: number = 1
): Promise<Blob> {
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error("Le navigateur n'a pas fourni de contexte de dessin.");

	const textWidth = POSTER_WIDTH - HEADER_PADDING * 2;
	ctx.font = `700 ${TITLE_SIZE}px ${SANS}`;
	const titleLines = wrapLines(content.question, textWidth, (text) => ctx.measureText(text).width);
	const footer = footerLines(content);

	const body = content.chart
		? { width: content.chart.width, height: content.chart.height }
		: {
				width: POSTER_WIDTH - PADDING * 2,
				height: tableHeight(content.table?.rows.length ?? 0),
				keepRatio: false
			};

	const layout = posterLayout(titleLines.length, footer.length, body);
	canvas.width = Math.round(layout.width * scale);
	canvas.height = Math.round(layout.height * scale);
	ctx.scale(scale, scale);

	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, layout.width, layout.height);

	ctx.fillStyle = brandGradient(ctx, layout.width, layout.headerHeight);
	ctx.fillRect(0, 0, layout.width, layout.headerHeight);

	ctx.fillStyle = '#000000';
	ctx.textBaseline = 'top';

	ctx.font = `600 ${SURVEY_SIZE}px ${SANS}`;
	const surveyLine = content.crossedWith
		? `${content.surveyTitle} · croisé avec « ${content.crossedWith} »`
		: content.surveyTitle;
	ctx.fillText(surveyLine, HEADER_PADDING, HEADER_PADDING);

	ctx.font = `700 ${TITLE_SIZE}px ${SANS}`;
	titleLines.forEach((line, index) => {
		ctx.fillText(line, HEADER_PADDING, HEADER_PADDING + SURVEY_SIZE + 16 + index * TITLE_LINE);
	});

	if (content.chart) {
		const chartImage = await loadImage(content.chart.dataUrl);
		ctx.drawImage(
			chartImage,
			layout.chart.x,
			layout.chart.y,
			layout.chart.width,
			layout.chart.height
		);
	} else if (content.table) {
		drawTable(ctx, content.table, layout.chart);
	}

	ctx.fillStyle = '#6b6360';
	ctx.font = `400 ${FOOTER_SIZE}px ${SANS}`;
	footer.forEach((line, index) => {
		ctx.fillText(line, PADDING, layout.footerY + index * FOOTER_LINE);
	});

	if (logoUrl) {
		// Le logo signe l affiche. Son echec ne doit pas emporter l export : une
		// image sans logo reste une image juste.
		await loadImage(logoUrl)
			.then((logo) => {
				const height = 40;
				const width = (logo.width / logo.height) * height;
				ctx.drawImage(logo, layout.width - PADDING - width, layout.footerY, width, height);
			})
			.catch(() => undefined);
	}

	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error("L'image n'a pas pu être produite."))),
			'image/png'
		);
	});
}
