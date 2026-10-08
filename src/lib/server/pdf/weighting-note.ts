import bowlby from '@fontsource/bowlby-one/files/bowlby-one-latin-400-normal.woff?inline';
import monoGreek from '@fontsource/jetbrains-mono/files/jetbrains-mono-greek-400-normal.woff?inline';
import mono from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?inline';
import monoMedium from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff?inline';
import jostBold from '@fontsource/jost/files/jost-latin-700-normal.woff?inline';
import jostItalic from '@fontsource/jost/files/jost-latin-400-italic.woff?inline';
import jost from '@fontsource/jost/files/jost-latin-400-normal.woff?inline';
import jostSemibold from '@fontsource/jost/files/jost-latin-600-normal.woff?inline';
import PDFDocument from 'pdfkit';
import logo from '../../../../static/logo-lockup-paper.png?inline';
import {
	MARGIN_COLUMNS,
	type NoteBlock,
	type NoteMarginRow,
	type NoteRun,
	type WeightingNote
} from '../survey/weighting-note';

/**
 * La note methodologique en PDF, a la charte de l'association.
 *
 * Registre « chiffres » de DESIGN.md : fond blanc, aucun degrade derriere un
 * nombre. La marque ne parle qu'en tete de la premiere page (bande noire, logo,
 * mot marque du titre) ; tout le reste est un document de travail sobre.
 *
 * Les polices sont les substituts libres de la charte, embarques dans le
 * fichier : la note se lit a l'identique chez un partenaire qui ne les a pas.
 */

const INK = '#000000';
const INK_SOFT = '#3d3a38';
const MUTED = '#6b6360';
const RULE = '#e6e3e1';
const PAPER = '#ffffff';
const CORAL = '#ff5757';
const PINK = '#ff88b7';
const ORANGE = '#ff751f';
const CORAL_INK = '#c1201f';

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = { top: 56, bottom: 64, side: 56 };
const CONTENT_WIDTH = PAGE.width - 2 * MARGIN.side;
const BAND_HEIGHT = 112;

const BODY = { size: 10, gap: 3.5 };
const NUMBER_COLUMN = 82;
const CELL_PADDING = 5;

type Doc = PDFKit.PDFDocument;

function bytes(dataUrl: string): Buffer {
	return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

function registerFonts(doc: Doc): void {
	doc.registerFont('display', bytes(bowlby));
	doc.registerFont('body', bytes(jost));
	doc.registerFont('body-italic', bytes(jostItalic));
	doc.registerFont('body-semibold', bytes(jostSemibold));
	doc.registerFont('body-bold', bytes(jostBold));
	doc.registerFont('mono', bytes(mono));
	doc.registerFont('mono-medium', bytes(monoMedium));
	doc.registerFont('mono-greek', bytes(monoGreek));
}

/*
 * JetBrains Mono ne dessine pas l'espace fine insecable que `Intl` place entre
 * les milliers : sans ce remplacement, « 1 000 » s'imprime avec un carre.
 */
function figures(value: string): string {
	return value.replaceAll(' ', ' ');
}

function bottomLimit(): number {
	return PAGE.height - MARGIN.bottom;
}

/** Saute une page si `height` ne tient plus sous le curseur. */
function ensureRoom(doc: Doc, height: number): void {
	if (doc.y + height > bottomLimit()) doc.addPage();
}

/*
 * Jost ne dessine pas l'alphabet grec : Σ et ε de la formule passent en
 * JetBrains Mono, qui le porte. Le texte reste un seul paragraphe enchaine.
 */
const GREEK = /([Ͱ-Ͽ]+)/;

interface Fragment {
	readonly text: string;
	readonly font: string;
	readonly size: number;
	readonly baseline?: number;
}

/*
 * Une coupure de ligne peut tomber entre deux fragments : la ponctuation qui
 * suit un mot en italique lui est donc rattachee, pour ne jamais ouvrir une
 * ligne par une virgule.
 */
function attachPunctuation(runs: readonly NoteRun[]): NoteRun[] {
	const merged: NoteRun[] = [];
	for (const run of runs) {
		const previous = merged.at(-1);
		const punctuation = /^[,.;:)]+/.exec(run.text)?.[0];
		if (previous?.style === 'em' && punctuation && !run.style) {
			merged[merged.length - 1] = { ...previous, text: previous.text + punctuation };
			merged.push({ text: run.text.slice(punctuation.length) });
			continue;
		}
		merged.push(run);
	}
	return merged;
}

function fragments(runs: readonly NoteRun[]): Fragment[] {
	return attachPunctuation(runs).flatMap((run) =>
		run.text
			.split(GREEK)
			.filter((part) => part.length > 0)
			.map((part): Fragment => {
				const greek = GREEK.test(part);
				if (run.style === 'sub') {
					return { text: part, font: 'body', size: BODY.size * 0.7, baseline: -2.5 };
				}
				const font = greek ? 'mono-greek' : run.style === 'em' ? 'body-italic' : 'body';
				return { text: part, font, size: greek ? BODY.size * 0.92 : BODY.size };
			})
	);
}

/*
 * Les fragments sont poses sur leur ligne de base (`alphabetic`), pour que
 * l'indice descende sous la ligne et non sous le haut du caractere. Le curseur
 * de pdfkit designant le haut de la ligne, on le descend d'une ascendante
 * avant d'ecrire. pdfkit n'expose pas cette mesure dans ses types.
 */
function ascent(doc: Doc, size: number): number {
	const font = (doc as unknown as { _font: { ascender: number } })._font;
	return (font.ascender / 1000) * size;
}

function paragraph(doc: Doc, runs: readonly NoteRun[]): void {
	const parts = fragments(runs);
	doc.font('body').fontSize(BODY.size).fillColor(INK_SOFT);
	doc.y += ascent(doc, BODY.size);
	parts.forEach((part, index) => {
		doc
			.font(part.font)
			.fontSize(part.size)
			.text(part.text, {
				width: CONTENT_WIDTH,
				lineGap: BODY.gap,
				continued: index < parts.length - 1,
				baseline: part.baseline ?? 'alphabetic'
			});
	});
	doc.y += 4;
}

function cover(doc: Doc, note: WeightingNote): void {
	doc.rect(0, 0, PAGE.width, BAND_HEIGHT).fill(INK);
	const logoWidth = 150;
	doc.image(bytes(logo), MARGIN.side, (BAND_HEIGHT - logoWidth * (335 / 1200)) / 2, {
		width: logoWidth
	});
	doc
		.font('body-semibold')
		.fontSize(9)
		.fillColor(PAPER)
		.text('Note méthodologique', MARGIN.side, BAND_HEIGHT / 2 - 12, {
			width: CONTENT_WIDTH,
			align: 'right'
		})
		.font('body')
		.fillColor(PAPER, 0.72)
		.text('Institut de sondage citoyen', { width: CONTENT_WIDTH, align: 'right' })
		.fillOpacity(1);

	markedTitle(doc, note.title, BAND_HEIGHT + 44);

	doc
		.font('body-bold')
		.fontSize(19)
		.fillColor(INK)
		.text(`de l'enquête « ${note.subject} »`, MARGIN.side, doc.y + 14, { width: CONTENT_WIDTH })
		.moveDown(0.3)
		.font('body')
		.fontSize(10)
		.fillColor(MUTED)
		.text(note.subtitle, { width: CONTENT_WIDTH });

	const ruleY = doc.y + 18;
	doc
		.moveTo(MARGIN.side, ruleY)
		.lineTo(PAGE.width - MARGIN.side, ruleY)
		.lineWidth(0.75)
		.strokeColor(RULE)
		.stroke();
	doc.x = MARGIN.side;
	doc.y = ruleY + 22;
}

/*
 * Le mot marque de DESIGN.md : une etiquette au degrade dense, de travers,
 * texte noir. Une seule par document, sur le titre.
 */
function markedTitle(doc: Doc, word: string, top: number): void {
	const size = 34;
	doc.font('display').fontSize(size);
	const padX = 10;
	const width = doc.widthOfString(word) + 2 * padX;
	const height = size * 1.18;
	const gradient = doc.linearGradient(MARGIN.side, top, MARGIN.side + width, top + height);
	gradient.stop(0, CORAL).stop(0.54, PINK).stop(1, ORANGE);

	doc.save();
	doc.rotate(-1.6, { origin: [MARGIN.side + width / 2, top + height / 2] });
	doc.roundedRect(MARGIN.side, top, width, height, 6).fill(gradient);
	doc.fillColor(INK).text(word, MARGIN.side + padX, top + size * 0.02, { lineBreak: false });
	doc.restore();
	doc.y = top + height;
}

function sectionTitle(doc: Doc, title: string): void {
	ensureRoom(doc, 80);
	doc
		.moveDown(0.4)
		.font('body-bold')
		.fontSize(13)
		.fillColor(INK)
		.text(title, MARGIN.side, doc.y, { width: CONTENT_WIDTH });
	doc.y += 2;
}

function columnX(index: number): number {
	const labelWidth = CONTENT_WIDTH - MARGIN_COLUMNS.length * NUMBER_COLUMN;
	return MARGIN.side + labelWidth + index * NUMBER_COLUMN;
}

function rule(doc: Doc, y: number, color = RULE, width = CONTENT_WIDTH): void {
	doc
		.moveTo(MARGIN.side, y)
		.lineTo(MARGIN.side + width, y)
		.lineWidth(0.5)
		.strokeColor(color)
		.stroke();
}

function marginHeader(doc: Doc): void {
	const top = doc.y;
	const labelWidth = columnX(0) - MARGIN.side - CELL_PADDING;
	doc.font('body-semibold').fontSize(8).fillColor(MUTED);
	doc.text('Modalité', MARGIN.side, top, { width: labelWidth });
	let bottom = doc.y;
	MARGIN_COLUMNS.forEach((column, index) => {
		doc.text(column, columnX(index), top, { width: NUMBER_COLUMN, align: 'right' });
		bottom = Math.max(bottom, doc.y);
	});
	doc.y = bottom + 3;
	rule(doc, doc.y, INK);
}

function marginRow(doc: Doc, row: NoteMarginRow): void {
	const labelWidth = columnX(0) - MARGIN.side - CELL_PADDING;
	doc.font('body').fontSize(9.5);
	const height = doc.heightOfString(row.label, { width: labelWidth }) + 2 * CELL_PADDING;
	if (doc.y + height > bottomLimit()) {
		doc.addPage();
		marginHeader(doc);
	}

	const top = doc.y;
	doc.fillColor(INK).text(row.label, MARGIN.side, top + CELL_PADDING, { width: labelWidth });
	const cells = [row.observed, row.target, row.weighted, row.deviation];
	cells.forEach((value, index) => {
		const far = row.far && index === cells.length - 1;
		doc
			.font(far ? 'mono-medium' : 'mono')
			.fontSize(9)
			.fillColor(far ? CORAL_INK : INK)
			.text(figures(value), columnX(index), top + CELL_PADDING + 0.5, {
				width: NUMBER_COLUMN,
				align: 'right',
				lineBreak: false
			});
	});
	doc.y = top + height;
	rule(doc, doc.y);
}

function margins(doc: Doc, block: Extract<NoteBlock, { kind: 'margins' }>): void {
	// La legende, l'en-tete et deux lignes restent ensemble.
	ensureRoom(doc, 110);
	doc.moveDown(0.5);
	doc
		.font('body-semibold')
		.fontSize(10.5)
		.fillColor(INK)
		.text(block.label, MARGIN.side, doc.y, { width: CONTENT_WIDTH, continued: true })
		.font('body')
		.fontSize(9)
		.fillColor(MUTED)
		.text(`  ${block.provenance}`)
		.moveDown(0.4);

	marginHeader(doc);
	block.rows.forEach((row) => marginRow(doc, row));

	if (block.footnote) {
		doc
			.moveDown(0.4)
			.font('body')
			.fontSize(8.5)
			.fillColor(MUTED)
			.text(block.footnote, MARGIN.side, doc.y, { width: CONTENT_WIDTH });
	}
	doc.moveDown(1);
}

function facts(doc: Doc, block: Extract<NoteBlock, { kind: 'facts' }>): void {
	const width = Math.min(CONTENT_WIDTH, 360);
	ensureRoom(doc, block.rows.length * 24);
	rule(doc, doc.y, INK, width);
	block.rows.forEach((row) => {
		const top = doc.y;
		doc
			.font('body')
			.fontSize(9.5)
			.fillColor(INK)
			.text(row.label, MARGIN.side, top + CELL_PADDING, { width: width - 120 });
		doc
			.font('mono')
			.fontSize(9)
			.text(figures(row.value), MARGIN.side + width - 120, top + CELL_PADDING + 0.5, {
				width: 120,
				align: 'right',
				lineBreak: false
			});
		doc.y = top + 9.5 * 1.4 + 2 * CELL_PADDING;
		rule(doc, doc.y, RULE, width);
	});
	doc.x = MARGIN.side;
	doc.y += 16;
}

function block(doc: Doc, item: NoteBlock): void {
	if (item.kind === 'paragraph') return paragraph(doc, item.runs);
	if (item.kind === 'margins') return margins(doc, item);
	return facts(doc, item);
}

/*
 * Le pied de page s'ecrit une fois le document fini, quand le nombre de pages
 * est connu. La marge basse est levee le temps de l'ecrire : sans cela, pdfkit
 * prend le pied de page pour un debordement et ouvre une page blanche.
 */
function footers(doc: Doc, note: WeightingNote): void {
	const range = doc.bufferedPageRange();
	for (let index = range.start; index < range.start + range.count; index += 1) {
		doc.switchToPage(index);
		doc.page.margins.bottom = 0;
		const y = PAGE.height - MARGIN.bottom + 24;
		doc
			.font('body')
			.fontSize(8)
			.fillColor(MUTED)
			.text(`Humanitour · ${note.title} de « ${note.subject} »`, MARGIN.side, y, {
				width: CONTENT_WIDTH - 80,
				lineBreak: false
			})
			.font('mono')
			.text(`${index + 1} / ${range.count}`, PAGE.width - MARGIN.side - 80, y, {
				width: 80,
				align: 'right',
				lineBreak: false
			});
	}
}

/** La note, en octets PDF. */
export function renderWeightingNotePdf(note: WeightingNote): Promise<Uint8Array<ArrayBuffer>> {
	const doc = new PDFDocument({
		size: 'A4',
		margins: { top: MARGIN.top, bottom: MARGIN.bottom, left: MARGIN.side, right: MARGIN.side },
		bufferPages: true,
		lang: 'fr-FR',
		displayTitle: true,
		info: {
			Title: `${note.title} de l'enquête « ${note.subject} »`,
			Author: 'Humanitour',
			Subject: note.subtitle,
			Creator: 'humanitour.fr'
		}
	});

	const chunks: Buffer[] = [];
	const done = new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
		doc.on('data', (chunk: Buffer) => chunks.push(chunk));
		doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
		doc.on('error', reject);
	});

	registerFonts(doc);
	cover(doc, note);
	note.sections.forEach((section) => {
		sectionTitle(doc, section.title);
		section.blocks.forEach((item) => block(doc, item));
	});
	footers(doc, note);
	doc.end();

	return done;
}
