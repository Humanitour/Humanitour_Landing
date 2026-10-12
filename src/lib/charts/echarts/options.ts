import type { CrosstabResult, DistributionResult } from '$lib/server/survey/aggregate';
import type { TimelineResult, TimelineSeries } from '$lib/server/survey/timeline';
import { formatCount, formatShare, formatWeek, SUPPRESSED_LABEL } from '$shared/format';
import { maxCellValue, readCell, type CellBasis } from '../crosstab-cell';
import {
	CATEGORICAL,
	colorFor,
	NON_RESPONSE_COLOR,
	SEQUENTIAL,
	SUPPRESSED_COLOR
} from '../palette';
import { categoryAxis, chartBase, CHART_INK, CHART_MUTED, endLabel, valueAxis } from './theme';

/**
 * Constructeurs d options ECharts.
 *
 * Des fonctions PURES : une donnee agregee entre, un objet d options sort.
 * C est ce qui permet de les tester, alors que les composants de graphiques ne
 * l etaient pas (AGENTS.md section 3.2 : si une logique est difficile a
 * tester, elle est au mauvais endroit).
 *
 * DEUX CONTRAINTES a respecter dans tout ce fichier.
 *
 * 1. L objet produit doit rester SERIALISABLE en JSON. Il est calcule sur le
 *    serveur, rendu en SVG la-bas, puis renvoye tel quel au navigateur qui
 *    reprend la main dessus. Une fonction de formatage ne traverserait pas.
 * 2. Les chiffres sont composes ICI, par `shared/format.ts`, et jamais laisses
 *    aux gabarits d ECharts. « {c} » ecrit « 30.4 » quand le reste du site
 *    ecrit « 30,4 % » : deux formatages concurrents de la meme part, ce que
 *    `format.ts` existe precisement pour empecher.
 */

/** Un objet d options ECharts, volontairement non type finement. */
export type ChartOption = Record<string, unknown>;

export interface ChartContext {
	/** Libelle exact de la question, affiche avec le graphique. */
	readonly question: string;
	/** Libelle de la question croisee, pour les formes a deux axes. */
	readonly crossedWith?: string;
	/**
	 * Emplacement de couleur par cle de modalite, fige sur l ordre declare.
	 * Sans lui, trier par effectif repeindrait le graphique (`palette.ts`).
	 */
	readonly colorSlots: Readonly<Record<string, number>>;
	/** Lecture des cases d un croisement. */
	readonly basis: CellBasis;
}

export interface BuiltChart {
	readonly option: ChartOption;
	/** Hauteur en pixels : le rendu serveur exige une taille explicite. */
	readonly height: number;
}

/** Part en pourcentage a une decimale, la precision publiee partout ailleurs. */
function percent(share: number | null): number {
	return Number(((share ?? 0) * 100).toFixed(1));
}

function colorOf(
	context: ChartContext,
	modality: { key: string; isNonResponse: boolean; color?: string | null }
): string {
	return colorFor(context.colorSlots[modality.key] ?? 0, {
		isNonResponse: modality.isNonResponse,
		override: modality.color
	});
}

/**
 * Hauteur d un graphique a barres horizontales.
 *
 * Elle suit le NOMBRE de modalites : une hauteur fixe ecraserait une question a
 * douze modalites en une grille illisible, et etirerait une question binaire
 * sur tout l ecran.
 */
function barsHeight(count: number): number {
	return Math.max(160, 40 + count * 38);
}

/** Repartition d une question, une barre par modalite, etiquetee au bout. */
export function barsOption(result: DistributionResult, context: ChartContext): BuiltChart {
	// L axe des categories se lit de haut en bas : ECharts empile depuis le bas,
	// on inverse donc pour que la premiere modalite soit en haut.
	const bars = [...result.bars].reverse();

	return {
		height: barsHeight(result.bars.length),
		option: {
			...chartBase(),
			grid: { left: 8, right: 64, top: 8, bottom: 8, containLabel: true },
			xAxis: valueAxis({ percent: true }),
			yAxis: categoryAxis(bars.map((bar) => bar.label)),
			series: [
				{
					type: 'bar',
					barMaxWidth: 26,
					label: endLabel(),
					data: bars.map((bar) => ({
						value: percent(bar.share),
						itemStyle: {
							color: bar.suppressed ? SUPPRESSED_COLOR : colorOf(context, bar),
							borderRadius: [0, 4, 4, 0]
						},
						// Une case masquee ne montre pas un zero : elle dit pourquoi elle
						// est vide, sinon on lirait « personne n a choisi cette reponse ».
						// Le gabarit « {c} » d ECharts ecrirait « 30.4 » : la part est donc
						// composee ici, avec le formatage unique du projet, sinon la meme
						// valeur s ecrirait de deux facons selon l endroit de la page.
						label: bar.suppressed
							? { formatter: SUPPRESSED_LABEL, color: CHART_MUTED, fontWeight: 400 }
							: { formatter: formatShare(bar.share) },
						tooltip: {
							formatter: bar.suppressed
								? `${bar.label} : ${SUPPRESSED_LABEL}`
								: `${bar.label}<br/><b>${formatShare(bar.share)}</b> (${formatCount(bar.count)} répondants)`
						}
					}))
				}
			]
		}
	};
}

/** Repartition en parts d un tout. Le centre porte la base, pas un logo. */
export function donutOption(result: DistributionResult, context: ChartContext): BuiltChart {
	const slices = result.bars.filter((bar) => !bar.suppressed);

	return {
		height: 320,
		option: {
			...chartBase(),
			series: [
				{
					type: 'pie',
					radius: ['48%', '76%'],
					center: ['50%', '50%'],
					// Trier ici casserait l ordre deja decide en amont (declare ou par
					// effectif) : le graphique affiche ce qu on lui donne.
					avoidLabelOverlap: true,
					itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
					label: {
						fontSize: 12,
						lineHeight: 16,
						color: '#000000'
					},
					labelLine: { length: 12, length2: 10 },
					data: slices.map((bar) => ({
						name: bar.label,
						value: percent(bar.share),
						itemStyle: { color: colorOf(context, bar) },
						label: { formatter: `${bar.label}\n${formatShare(bar.share)}` },
						tooltip: {
							formatter: `${bar.label}<br/><b>${formatShare(bar.share)}</b> (${formatCount(bar.count)} répondants)`
						}
					}))
				}
			]
		}
	};
}

/**
 * Les modalites croisees qui ont au moins un repondant dans la population.
 *
 * Le croisement garde toutes les modalites declarees, y compris celles qu un
 * filtre a videes : filtrer sur deux partis laissait les dix autres dans la
 * legende, sans aucune barre en face, et amincissait les deux barres restantes
 * pour faire place a des series vides. Un total MASQUE (`null`) n est pas un
 * total nul : on ne sait pas ce qu il contient, la serie reste.
 */
export function shownColumns(table: CrosstabResult): CrosstabResult['yModalities'] {
	return table.yModalities.filter((modality) => table.columnTotals.get(modality.key) !== 0);
}

/** Les modalites croisees, dans l ordre ou elles doivent garder leur couleur. */
function crossSeries(
	table: CrosstabResult,
	context: ChartContext,
	stacked: boolean
): readonly ChartOption[] {
	const rows = [...table.xModalities].reverse();

	return shownColumns(table).map((yModality) => ({
		name: yModality.label,
		type: 'bar',
		stack: stacked ? 'total' : undefined,
		barMaxWidth: stacked ? 30 : 14,
		itemStyle: {
			color: colorOf(context, yModality)
		},
		data: rows.map((xModality) => crossCell(table, xModality, yModality))
	}));
}

/** Une case du croisement, avec son infobulle deja redigee. */
function crossCell(
	table: CrosstabResult,
	xModality: { key: string; label: string },
	yModality: { key: string; label: string }
): ChartOption {
	const cell = table.cells.get(xModality.key)?.get(yModality.key);

	if (cell?.suppressed) {
		return {
			value: 0,
			itemStyle: { color: SUPPRESSED_COLOR },
			tooltip: { formatter: `${xModality.label} / ${yModality.label} : ${SUPPRESSED_LABEL}` }
		};
	}

	return {
		value: percent(cell?.share ?? null),
		tooltip: {
			formatter: `${xModality.label}<br/>${yModality.label} : <b>${formatShare(cell?.share ?? null)}</b> (${formatCount(cell?.count ?? null)})`
		}
	};
}

/*
 * Legende des croisements et des courbes.
 *
 * Elle passe a la ligne au lieu de defiler : une legende `scroll` n affichait
 * que sa premiere page, et les modalites suivantes n etaient atteignables
 * qu avec des fleches que personne ne voyait. Chaque entree est donc visible.
 *
 * Une legende qui passe a la ligne a une hauteur qu ECharts ne reserve pas
 * dans la grille. Elle est estimee ici, a partir de la longueur des libelles,
 * pour deux largeurs : celle d un telephone, qui fixe la hauteur du graphique,
 * et celle d une colonne d ordinateur, ou la legende tient sur moins de lignes
 * et rend la place au dessin (`media`, lu par ECharts a chaque redimensionnement).
 */
const LEGEND_FONT = 12;
const LEGEND_ICON = 12;
const LEGEND_GAP = 10;
/** Largeur moyenne d un caractere, prise large : mieux vaut une ligne de trop. */
const LEGEND_CHAR = 7;
const LEGEND_ROW = LEGEND_ICON + LEGEND_GAP + 2;
const NARROW_WIDTH = 320;
const WIDE_WIDTH = 640;

/** Nombre de lignes occupees par la legende a une largeur donnee. */
export function legendRows(labels: readonly string[], width: number): number {
	if (labels.length === 0) return 0;

	const available = width - 2 * 5;
	let rows = 1;
	let line = 0;

	for (const label of labels) {
		const item = LEGEND_ICON + 5 + label.length * LEGEND_CHAR;
		const needed = line === 0 ? item : line + LEGEND_GAP + item;

		if (needed > available && line > 0) {
			rows += 1;
			line = item;
		} else {
			line = needed;
		}
	}

	return rows;
}

/** Hauteur reservee au-dessus de la grille pour la legende. */
function legendSpace(labels: readonly string[], width: number): number {
	const rows = legendRows(labels, width);
	return rows === 0 ? 0 : rows * LEGEND_ROW + 8;
}

/**
 * Legende en tete du graphique, et la place qu elle prend.
 *
 * En tete : la cle se lit avant les barres qu elle decrit.
 */
function crossLegend(labels: readonly string[], gridTop: number) {
	const narrow = legendSpace(labels, NARROW_WIDTH);
	const wide = legendSpace(labels, WIDE_WIDTH);

	return {
		/** Hauteur a ajouter au graphique, celle du cas le plus etroit. */
		space: narrow,
		legend: {
			type: 'plain',
			top: 0,
			left: 0,
			icon: 'roundRect',
			itemWidth: LEGEND_ICON,
			itemHeight: LEGEND_ICON,
			itemGap: LEGEND_GAP,
			textStyle: { fontSize: LEGEND_FONT, color: '#000000' }
		},
		gridTop: gridTop + narrow,
		media: [{ query: { minWidth: WIDE_WIDTH }, option: { grid: { top: gridTop + wide } } }]
	};
}

/** Croisement empile : chaque ligne vaut 100 % d elle-meme. */
export function stackedOption(table: CrosstabResult, context: ChartContext): BuiltChart {
	const key = crossLegend(
		shownColumns(table).map((modality) => modality.label),
		8
	);

	return {
		height: Math.max(220, 44 + table.xModalities.length * 44) + key.space,
		option: {
			...chartBase(),
			legend: key.legend,
			media: key.media,
			grid: { left: 8, right: 16, top: key.gridTop, bottom: 8, containLabel: true },
			xAxis: valueAxis({ max: 100, percent: true }),
			yAxis: categoryAxis([...table.xModalities].reverse().map((modality) => modality.label)),
			series: crossSeries(table, context, true)
		}
	};
}

/**
 * Croisement en barres groupees.
 *
 * Cote a cote plutot qu empilees : au-dela de deux modalites croisees, une pile
 * ne permet plus de comparer autre chose que le premier segment, tous les
 * autres commencant a une hauteur differente.
 */
export function groupedOption(table: CrosstabResult, context: ChartContext): BuiltChart {
	const rows = table.xModalities.length;
	const columns = shownColumns(table);
	const series = Math.max(1, columns.length);
	const key = crossLegend(
		columns.map((modality) => modality.label),
		8
	);

	/*
	 * Une modalite occupe UNE ligne, quel que soit le nombre de series.
	 *
	 * La version precedente laissait le groupe grandir avec les series : une
	 * question a quatre modalites croisees prenait quatre hauteurs de barre, et
	 * une seule modalite s etalait sur le quart de l ecran. On fixe donc la
	 * hauteur de ligne et on amincit les barres pour qu elles y tiennent.
	 */
	const ROW_HEIGHT = 46;
	const barWidth = Math.max(4, Math.floor(30 / series));

	return {
		height: Math.max(220, 44 + rows * ROW_HEIGHT) + key.space,
		option: {
			...chartBase(),
			legend: key.legend,
			media: key.media,
			grid: { left: 8, right: 48, top: key.gridTop, bottom: 8, containLabel: true },
			xAxis: valueAxis({ percent: true }),
			yAxis: categoryAxis([...table.xModalities].reverse().map((modality) => modality.label)),
			series: crossSeries(table, context, false).map((serie) => ({
				...serie,
				barWidth,
				barGap: '20%',
				barCategoryGap: '35%'
			}))
		}
	};
}

/**
 * Carte de chaleur : le croisement en intensite.
 *
 * L intensite se lit comme une quantite, donc une SEULE teinte du clair au
 * fonce (`palette.ts`), jamais un arc-en-ciel. La valeur est ecrite dans
 * chaque case : la couleur situe, le chiffre dit.
 */
export function heatmapOption(table: CrosstabResult, context: ChartContext): BuiltChart {
	const rows = [...table.xModalities].reverse();
	const columns = shownColumns(table);
	const max = maxCellValue(table, context.basis);

	const data = rows.flatMap((xModality, rowIndex) =>
		columns.map((yModality, columnIndex) => {
			const reading = readCell(table, xModality.key, yModality.key, context.basis);

			return {
				value: [columnIndex, rowIndex, reading.value ?? 0],
				itemStyle: reading.suppressed ? { color: SUPPRESSED_COLOR } : undefined,
				label: { formatter: reading.text },
				tooltip: {
					formatter: `${xModality.label}<br/>${yModality.label} : <b>${reading.text}</b>`
				}
			};
		})
	);

	return {
		height: Math.max(220, 90 + rows.length * 44),
		option: {
			...chartBase(),
			grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
			xAxis: {
				...categoryAxis(columns.map((modality) => modality.label)),
				position: 'top'
			},
			yAxis: categoryAxis(rows.map((modality) => modality.label)),
			// `max` a zero signifie que TOUT est masque : une echelle a zero
			// laisserait ECharts peindre toutes les cases de la teinte la plus
			// forte, ce qui suggererait une intensite qu on ne publie pas.
			visualMap: {
				show: false,
				min: 0,
				max: max > 0 ? max : 1,
				inRange: { color: [...SEQUENTIAL] }
			},
			series: [
				{
					type: 'heatmap',
					data,
					label: { show: true, fontSize: 12, color: '#000000' },
					itemStyle: { borderColor: '#ffffff', borderWidth: 2, borderRadius: 4 }
				}
			]
		}
	};
}

/**
 * Nombre de courbes NOMMEES avant le repli dans « Autres ».
 *
 * La palette validee compte huit teintes (`palette.ts`). Au-dela, `colorFor`
 * rend du gris : vingt-quatre courbes grises indiscernables, et confondues avec
 * la non-reponse, qui est grise aussi. La regle est donc celle de toute la
 * visualisation du projet : une neuvieme serie ne recoit jamais une teinte
 * inventee, elle rejoint « Autres ». Sept courbes nommees, la huitieme place
 * revenant a « Autres ».
 */
export const TIMELINE_NAMED_MAX = CATEGORICAL.length - 1;

/** Cle de la serie « Autres » produite par le repli. */
export const OTHERS_KEY = '__autres__';

/** Moyenne des parts publiees, pour classer les modalites. */
function meanShare(series: TimelineSeries): number {
	const publiees = series.shares.filter((share): share is number => share !== null);
	if (publiees.length === 0) return 0;
	return publiees.reduce((total, share) => total + share, 0) / publiees.length;
}

/** Somme des parts repliees sur une periode, ou `null` des qu une manque. */
function sumAt(repliees: readonly TimelineSeries[], index: number): number | null {
	let somme = 0;
	for (const entry of repliees) {
		const part = entry.shares[index];
		if (part === null || part === undefined) return null;
		somme += part;
	}
	return somme;
}

/**
 * Replie les modalites au-dela de la palette dans une serie « Autres ».
 *
 * Les modalites conservees sont les PLUS PRESENTES sur l ensemble du terrain,
 * pas les premieres declarees : pour le premier tour, l ordre declare est celui
 * d une liste de partis, et en garder les sept premiers pourrait ne montrer que
 * des candidatures marginales.
 *
 * La part d « Autres » est la somme des modalites repliees, periode par
 * periode. Des qu UNE d entre elles est masquee sur une periode, la somme
 * devient `null` : elle serait sinon sous-estimee, et une courbe « Autres » qui
 * plonge une semaine parce qu une case est cachee raconterait une evolution qui
 * n a pas eu lieu.
 *
 * La non-reponse n est jamais repliee : c est une modalite de plein droit, et la
 * fondre dans « Autres » l effacerait precisement la ou on la montre.
 */
export function foldTimeline(series: readonly TimelineSeries[]): {
	named: TimelineSeries[];
	others: TimelineSeries | null;
} {
	const reponses = series.filter((entry) => !entry.isNonResponse);
	const nonReponses = series.filter((entry) => entry.isNonResponse);

	if (reponses.length <= TIMELINE_NAMED_MAX + 1) {
		return { named: [...reponses, ...nonReponses], others: null };
	}

	const gardees = new Set(
		[...reponses]
			.sort((a, b) => meanShare(b) - meanShare(a))
			.slice(0, TIMELINE_NAMED_MAX)
			.map((entry) => entry.key)
	);
	const repliees = reponses.filter((entry) => !gardees.has(entry.key));
	const periodes = series[0]?.shares.length ?? 0;

	return {
		// L ordre declare est conserve parmi les gardees : le tri par presence ne
		// sert qu a choisir, pas a ordonner la legende.
		named: [...reponses.filter((entry) => gardees.has(entry.key)), ...nonReponses],
		others: {
			key: OTHERS_KEY,
			label: `Autres (${repliees.length} réponses)`,
			isNonResponse: false,
			color: null,
			shares: Array.from({ length: periodes }, (_, index) => sumAt(repliees, index))
		}
	};
}

/** Teinte d une courbe : figee sur l ordre declare, sauf en repli. */
function lineColor(
	entry: TimelineSeries,
	rang: number,
	repli: boolean,
	context: ChartContext
): string {
	if (entry.isNonResponse) return NON_RESPONSE_COLOR;
	// En repli, la teinte suit le rang parmi les courbes gardees : les
	// emplacements figes sur l ordre declare depasseraient la palette.
	if (repli) return CATEGORICAL[rang] ?? NON_RESPONSE_COLOR;
	return colorOf(context, entry);
}

/** Un point de courbe, avec son infobulle composee ici. */
function timelinePoint(
	share: number | null,
	semaine: string,
	label: string,
	respondents: number | null
) {
	if (share === null) {
		return {
			value: null,
			tooltip: { formatter: `Semaine du ${semaine}<br/>${label} : ${SUPPRESSED_LABEL}` }
		};
	}
	return {
		value: percent(share),
		tooltip: {
			formatter: `Semaine du ${semaine}<br/>${label} : <b>${formatShare(share)}</b> (base : ${formatCount(respondents)} répondants)`
		}
	};
}

/**
 * Evolution d une question, une courbe par modalite.
 *
 * Trois partis pris, chacun contre une erreur de lecture precise.
 *
 * 1. Une semaine masquee est un TROU. `connectNulls: false` : la courbe
 *    s interrompt au lieu de relier ses voisines d un trait qui ferait croire a
 *    une evolution reguliere pendant une semaine dont on ne sait rien.
 * 2. L axe des parts part de zero et n est pas plafonne a 100 %. Plafonne, des
 *    courbes qui oscillent entre 10 et 25 % s ecraseraient en bas du cadre ;
 *    sans plancher a zero, un ecart de deux points paraitrait un effondrement.
 * 3. Aucun chiffre sur chaque point. L etiquette directe est posee a la fin de
 *    chaque courbe, et seulement jusqu a quatre courbes : au-dela, elles se
 *    chevauchent, et la legende prend le relais.
 *
 * L infobulle est composee point par point, ici, et non par un gabarit
 * d ECharts : elle doit rester serialisable et ecrire « 30,4 % », pas « 30.4 ».
 */
export function timelineOption(result: TimelineResult, context: ChartContext): BuiltChart {
	const { named, others } = foldTimeline(result.series);
	const semaines = result.periods.map((period) => formatWeek(period.start));
	const repli = others !== null;

	const tracees = named.map((entry, rang) => ({
		series: entry,
		color: lineColor(entry, rang, repli, context),
		dashed: false
	}));

	if (others) {
		// « Autres » se distingue par son TRAIT, pas par une teinte de plus : la
		// palette n en a pas de neuvieme, et une couleur inventee casserait sa
		// validation daltonienne.
		tracees.push({ series: others, color: CHART_MUTED, dashed: true });
	}

	const etiquettesDirectes = tracees.length <= 4;
	const key = crossLegend(
		tracees.map(({ series }) => series.label),
		16
	);

	return {
		height: 316 + key.space,
		option: {
			...chartBase(),
			grid: {
				left: 8,
				right: etiquettesDirectes ? 120 : 24,
				top: key.gridTop,
				bottom: 8,
				containLabel: true
			},
			legend: key.legend,
			media: key.media,
			xAxis: {
				...categoryAxis(semaines),
				boundaryGap: false,
				// Le reticule : une ligne verticale qui suit le survol et aligne
				// l oeil sur la semaine lue, d une courbe a l autre.
				axisPointer: {
					show: true,
					type: 'line',
					lineStyle: { color: CHART_MUTED, type: 'dashed' }
				}
			},
			yAxis: { ...valueAxis({ percent: true }), min: 0 },
			series: tracees.map(({ series, color, dashed }) => ({
				type: 'line',
				name: series.label,
				connectNulls: false,
				symbol: 'circle',
				symbolSize: 8,
				showSymbol: true,
				lineStyle: { width: 2, color, type: dashed ? 'dashed' : 'solid' },
				itemStyle: { color, borderColor: '#ffffff', borderWidth: 2 },
				endLabel: etiquettesDirectes
					? { show: true, color: CHART_INK, fontSize: 12, formatter: series.label }
					: { show: false },
				data: series.shares.map((share, index) =>
					timelinePoint(
						share,
						semaines[index] ?? '',
						series.label,
						result.periods[index]?.respondents ?? null
					)
				)
			}))
		}
	};
}
