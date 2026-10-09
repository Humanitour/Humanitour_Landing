import { defineBlockType } from '../types';
import { introField, spacingField, surfaceField, titleField } from './common';

/**
 * La selection de l equipe : les croisements mis en avant au back-office,
 * enquete par enquete (onglet « Sélection » d un sondage).
 *
 * Comme le catalogue, la liste ne se saisit pas ici : elle vient de la base,
 * et chaque carte ouvre l explorateur public. La section regle ce qui
 * l entoure, combien de croisements montrer, et le texte affiche quand aucun
 * n est encore publie.
 *
 * Aucun chiffre n y figure : une carte est un permalien titre. Le chiffre se
 * lit une fois le croisement ouvert, avec sa base et ses seuils.
 */
export const SELECTION_COUNTS = ['3', '6'] as const;

export const selectionType = defineBlockType({
	key: 'selection',
	label: 'Sélection de l’équipe',
	description: 'Les croisements que l’équipe met en avant, ouverts dans l’explorateur.',
	group: 'site',

	fields: [
		titleField(),
		introField(),
		{
			name: 'count',
			label: 'Nombre de croisements',
			help: 'Les plus récents d’abord, dans l’ordre choisi pour chaque enquête.',
			type: 'choice',
			required: false,
			options: [
				{ value: '3', label: 'Trois' },
				{ value: '6', label: 'Six' }
			],
			fallback: '3'
		},
		{
			name: 'emptyText',
			label: 'Texte quand aucun croisement n’est publié',
			type: 'textarea',
			required: true
		},
		surfaceField('cream'),
		spacingField()
	],

	starter: {
		title: 'Les croisements qui parlent',
		intro: 'Choisis par l’équipe. Chacun s’ouvre dans l’explorateur, avec les chiffres du moment.',
		count: '3',
		emptyText: 'L’équipe n’a pas encore publié sa sélection.',
		surface: 'cream',
		spacing: 'normal'
	}
});
