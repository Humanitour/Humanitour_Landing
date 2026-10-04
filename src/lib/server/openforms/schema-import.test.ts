import { describe, expect, it } from 'vitest';
import type { OpenformsField } from '$lib/shared/openforms/types';
import {
	IGNORED_REASON,
	planQuestionsFromForm,
	withIgnoredKey,
	withoutIgnoredKeys
} from './schema-import';

function field(partial: Partial<OpenformsField> & { key: string; type: string }): OpenformsField {
	return { label: partial.key, required: false, options: [], ...partial };
}

const radio = (key: string, label: string, options: { value: string; label: string }[]) =>
	field({ key, type: 'radio', label, options });

describe('planQuestionsFromForm', () => {
	it('cree une question par champ qui porte une reponse', () => {
		const plan = planQuestionsFromForm(
			[radio('champ_a1', 'Zone d’habitation', [{ value: 'opt1', label: 'Rurale' }])],
			[]
		);

		expect(plan.skipped).toEqual([]);
		expect(plan.drafts).toHaveLength(1);
		expect(plan.drafts[0]).toMatchObject({
			openformsKey: 'champ_a1',
			code: 'zone_d_habitation',
			label: 'Zone d’habitation',
			type: 'single_choice'
		});
	});

	it('code les modalites sur la VALEUR distante, pas sur le libelle', () => {
		// Le cas qui casse tout : Openforms soumet « opt1 », pas « Bretagne ». Un
		// code tire du libelle ferait rejeter chaque reponse pour modalite inconnue.
		const plan = planQuestionsFromForm(
			[
				radio('champ_a1', 'Région', [
					{ value: 'opt1', label: 'Bretagne' },
					{ value: 'opt2', label: 'Normandie' }
				])
			],
			[]
		);

		expect(plan.drafts[0]?.options).toEqual([
			{ code: 'opt1', label: 'Bretagne', position: 0, isNonResponse: false, color: null },
			{ code: 'opt2', label: 'Normandie', position: 1, isNonResponse: false, color: null }
		]);
	});

	it('ne tronque pas un code de modalite, meme tres long', () => {
		const long = 'Transparent : j’accepte la diffusion de mon visage et de ma voix.';
		const plan = planQuestionsFromForm(
			[radio('c', 'Visibilité', [{ value: long, label: long }])],
			[]
		);

		expect(plan.drafts[0]?.options[0]?.code.length).toBeGreaterThan(40);
	});

	it('marque les non-reponses declarees, et elles seules', () => {
		const plan = planQuestionsFromForm(
			[
				radio('c', 'Vote', [
					{ value: 'opt1', label: 'Un parti' },
					{ value: 'opt2', label: 'Ne se prononce pas' },
					{ value: 'opt3', label: 'Aucun' }
				])
			],
			[]
		);

		// « Aucun » est une reponse, pas une abstention : la classer en
		// non-reponse ferait disparaitre un choix reel (AGENTS.md section 1.2).
		expect(plan.drafts[0]?.options.map((option) => option.isNonResponse)).toEqual([
			false,
			true,
			false
		]);
	});

	it('ecarte les champs identifiants par leur type', () => {
		const plan = planQuestionsFromForm(
			[
				field({ key: 'c1', type: 'email', label: 'Email' }),
				field({ key: 'c2', type: 'signature', label: 'Signature' })
			],
			[]
		);

		expect(plan.drafts).toEqual([]);
		expect(plan.skipped.map((entry) => entry.label)).toEqual(['Email', 'Signature']);
	});

	it('ecarte un texte libre dont le LIBELLE annonce une donnee identifiante', () => {
		// La cle distante est opaque : `normalize/identifying` ne peut rien voir.
		// C'est le dernier point ou « Nom et prenom » peut etre arrete.
		const plan = planQuestionsFromForm(
			[
				field({
					key: 'champ_mrkpxig1_2',
					type: 'short_text',
					label: 'Nom et prénom (reste confidentiel)'
				})
			],
			[]
		);

		expect(plan.drafts).toEqual([]);
		expect(plan.skipped[0]?.reason).toContain('identifiante');
	});

	it('ecarte un type sans question qui le recoive, sans inventer', () => {
		const plan = planQuestionsFromForm([field({ key: 'c', type: 'date', label: 'Date' })], []);

		expect(plan.drafts).toEqual([]);
		expect(plan.skipped[0]?.reason).toContain('aucun type de question');
	});

	it('ecarte un type inconnu du depot en le nommant', () => {
		const plan = planQuestionsFromForm([field({ key: 'c', type: 'hologramme', label: 'X' })], []);

		expect(plan.skipped[0]?.reason).toContain('hologramme');
	});

	it('ignore en silence les elements de mise en page', () => {
		const plan = planQuestionsFromForm(
			[
				field({ key: 'c1', type: 'section', label: 'Vos habitudes' }),
				field({ key: 'c2', type: 'text_block', label: 'Merci' })
			],
			[]
		);

		expect(plan).toEqual({ drafts: [], additions: [], skipped: [] });
	});

	it('ne retouche pas un champ deja relie : relancer ne cree rien', () => {
		const fields = [radio('champ_a1', 'Région', [{ value: 'opt1', label: 'Bretagne' }])];
		const first = planQuestionsFromForm(fields, []);

		const second = planQuestionsFromForm(fields, [
			{
				code: first.drafts[0]!.code,
				openformsKey: 'champ_a1',
				optionCodes: first.drafts[0]!.options.map((option) => option.code)
			}
		]);

		expect(second).toEqual({ drafts: [], additions: [], skipped: [] });
	});

	it('suffixe un code deja pris, dans l’enquete comme dans le lot', () => {
		const plan = planQuestionsFromForm(
			[radio('c1', 'Région', []), radio('c2', 'Région', [])],
			[{ code: 'region', openformsKey: null }]
		);

		expect(plan.drafts.map((draft) => draft.code)).toEqual(['region_2', 'region_3']);
	});

	it('retombe sur la cle distante quand le libelle est vide', () => {
		const plan = planQuestionsFromForm([radio('champ_a1', '   ', [])], []);

		expect(plan.drafts[0]).toMatchObject({ code: 'question', label: 'champ_a1' });
	});

	it('ecarte une modalite en double plutot que de faire echouer l’ecriture', () => {
		const plan = planQuestionsFromForm(
			[
				radio('c', 'Vote', [
					{ value: 'opt1', label: 'Oui' },
					{ value: 'opt1', label: 'Oui (doublon)' }
				])
			],
			[]
		);

		expect(plan.drafts[0]?.options).toHaveLength(1);
	});
});

describe('planQuestionsFromForm, modalite « Autre »', () => {
	it('cree une modalite « Autre » quand le champ autorise la reponse libre', () => {
		const plan = planQuestionsFromForm(
			[
				field({
					key: 'c',
					type: 'radio',
					label: 'Vote',
					allowOther: true,
					options: [{ value: 'opt1', label: 'Un parti' }]
				})
			],
			[]
		);

		expect(plan.drafts[0]?.options.map((option) => option.code)).toEqual(['opt1', 'autre']);
	});

	it('n en cree pas quand le champ ne l autorise pas', () => {
		const plan = planQuestionsFromForm(
			[radio('c', 'Vote', [{ value: 'opt1', label: 'Un parti' }])],
			[]
		);

		expect(plan.drafts[0]?.options.map((option) => option.code)).toEqual(['opt1']);
	});
});

describe('planQuestionsFromForm, reconciliation des modalites', () => {
	it('ajoute a une question deja reliee la modalite apparue depuis', () => {
		const plan = planQuestionsFromForm(
			[
				radio('champ_a1', 'Région', [
					{ value: 'opt1', label: 'Bretagne' },
					{ value: 'opt2', label: 'Normandie' }
				])
			],
			[{ code: 'region', label: 'Région', openformsKey: 'champ_a1', optionCodes: ['opt1'] }]
		);

		expect(plan.drafts).toEqual([]);
		expect(plan.additions).toHaveLength(1);
		expect(plan.additions[0]?.questionCode).toBe('region');
		expect(plan.additions[0]?.options.map((option) => option.code)).toEqual(['opt2']);
	});

	it('rattrape le « Autre » manquant sur une question deja creee', () => {
		// Le cas rencontre : les questions avaient ete reprises avant que la
		// modalite « Autre » n'existe, et quarante-quatre repondants etaient
		// refuses pour cette seule case.
		const plan = planQuestionsFromForm(
			[
				field({
					key: 'champ_a1',
					type: 'radio',
					label: 'Vote',
					allowOther: true,
					options: [{ value: 'opt1', label: 'Un parti' }]
				})
			],
			[{ code: 'vote', openformsKey: 'champ_a1', optionCodes: ['opt1'] }]
		);

		expect(plan.additions[0]?.options.map((option) => option.code)).toEqual(['autre']);
	});

	it('ne propose rien quand la question connait deja toutes les modalites', () => {
		const plan = planQuestionsFromForm(
			[radio('champ_a1', 'Région', [{ value: 'opt1', label: 'Bretagne' }])],
			[{ code: 'region', openformsKey: 'champ_a1', optionCodes: ['opt1'] }]
		);

		expect(plan.additions).toEqual([]);
	});

	it('ne supprime jamais une modalite retiree du formulaire', () => {
		// Des reponses la portent peut-etre : l'effacer reecrirait le passe.
		const plan = planQuestionsFromForm(
			[radio('champ_a1', 'Médias', [{ value: 'tele', label: 'Télévision' }])],
			[{ code: 'medias', openformsKey: 'champ_a1', optionCodes: ['tele', 'cnews'] }]
		);

		expect(plan.additions).toEqual([]);
		expect(plan.skipped).toEqual([]);
	});
});

describe('planQuestionsFromForm, champs ecartes au back-office', () => {
	it('ne recree pas un champ ecarte, et le nomme parmi les ecarts', () => {
		const plan = planQuestionsFromForm(
			[
				radio('champ_a1', 'Région', [{ value: 'bzh', label: 'Bretagne' }]),
				radio('champ_a2', 'Heure de passage', [{ value: 'matin', label: 'Matin' }])
			],
			[],
			['champ_a2']
		);

		expect(plan.drafts.map((draft) => draft.openformsKey)).toEqual(['champ_a1']);
		expect(plan.skipped).toEqual([
			{ key: 'champ_a2', label: 'Heure de passage', reason: IGNORED_REASON }
		]);
	});

	it('laisse une question reliee a la main l emporter sur l ecart', () => {
		const plan = planQuestionsFromForm(
			[
				radio('champ_a1', 'Région', [
					{ value: 'bzh', label: 'Bretagne' },
					{ value: 'idf', label: 'IDF' }
				])
			],
			[{ code: 'region', openformsKey: 'champ_a1', optionCodes: ['bzh'] }],
			['champ_a1']
		);

		expect(plan.skipped).toEqual([]);
		expect(plan.additions[0]?.options.map((option) => option.code)).toEqual(['idf']);
	});
});

describe('liste des champs ecartes', () => {
	it('ajoute une cle une seule fois, a la suite', () => {
		expect(withIgnoredKey(['a'], 'b')).toEqual(['a', 'b']);
		expect(withIgnoredKey(['a', 'b'], 'a')).toEqual(['a', 'b']);
	});

	it('retire les cles retablies et garde l ordre des autres', () => {
		expect(withoutIgnoredKeys(['a', 'b', 'c'], ['b', 'z'])).toEqual(['a', 'c']);
		expect(withoutIgnoredKeys([], new Set(['a']))).toEqual([]);
	});
});
