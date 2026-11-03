import { describe, expect, it } from 'vitest';
import {
	crossableQuestionTypes,
	findOption,
	getQuestionType,
	NON_RESPONSE_KEY,
	QUESTION_TYPES,
	requireQuestionType,
	type QuestionContext,
	type QuestionOptionLike
} from './index';
import { bucketKey } from './number';

function option(
	code: string,
	label: string,
	position: number,
	isNonResponse = false
): QuestionOptionLike {
	return { code, label, position, isNonResponse, color: null };
}

const PRIORITIES: QuestionOptionLike[] = [
	option('pouvoir_achat', "Le pouvoir d'achat", 1),
	option('sante', 'La sante', 2),
	option('ecologie', "L'ecologie", 3),
	option('nsp', 'Ne se prononce pas', 99, true)
];

function context(options: QuestionOptionLike[] = [], config: Record<string, unknown> = {}) {
	return { options, config } satisfies QuestionContext;
}

describe('registre', () => {
	it('expose des cles uniques', () => {
		const keys = QUESTION_TYPES.map((type) => type.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('retourne null pour un type inconnu et leve avec requireQuestionType', () => {
		expect(getQuestionType('inexistant')).toBeNull();
		expect(() => requireQuestionType('inexistant')).toThrow(/inconnu/i);
	});

	it('ne propose au croisement que les types croisables', () => {
		const crossable = crossableQuestionTypes().map((type) => type.key);

		expect(crossable).toContain('single_choice');
		// Un verbatim a autant de modalites que de repondants : jamais croisable.
		expect(crossable).not.toContain('free_text');
	});
});

describe('invariant partage par tous les types', () => {
	// C est la regle qui evite que la non-reponse redevienne un cas particulier :
	// elle doit se comporter pareil quel que soit le type de question.
	const blanks = [null, undefined, '', '   ', []];

	for (const type of QUESTION_TYPES) {
		it(`« ${type.key} » traite une valeur vide comme une non-reponse`, () => {
			for (const blank of blanks) {
				const result = type.normalize(blank, context(PRIORITIES, { min: 1, max: 5 }));

				expect(result.ok).toBe(true);
				if (!result.ok) return;
				expect(result.values).toHaveLength(1);
				expect(result.values[0]?.modalityKey).toBe(NON_RESPONSE_KEY);
			}
		});

		it(`« ${type.key} » declare la non-reponse parmi ses modalites`, () => {
			const modalities = type.modalities(context(PRIORITIES, { min: 1, max: 5 }));
			const nonResponse = modalities.filter((modality) => modality.isNonResponse);

			expect(nonResponse).toHaveLength(1);
			expect(nonResponse[0]?.key).toBe(NON_RESPONSE_KEY);
			// Comptee comme les autres, mais lue en dernier.
			expect(modalities.at(-1)?.isNonResponse).toBe(true);
		});

		it(`« ${type.key} » accepte une configuration vide`, () => {
			expect(type.parseConfig(undefined).ok).toBe(true);
		});
	}
});

describe('single_choice', () => {
	const type = requireQuestionType('single_choice');

	it('reconnait une modalite par son code', () => {
		const result = type.normalize('sante', context(PRIORITIES));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.values[0]?.modalityKey).toBe('sante');
		expect(result.values[0]?.optionCode).toBe('sante');
	});

	it('reconnait une modalite par son libelle, casse et espaces ignores', () => {
		// Les fichiers exportes contiennent le libelle aussi souvent que le code :
		// refuser l un des deux ferait rejeter des jeux de donnees valides.
		const result = type.normalize('  LA SANTE  ', context(PRIORITIES));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.values[0]?.modalityKey).toBe('sante');
	});

	it('rejette une modalite inconnue plutot que de l ignorer', () => {
		const result = type.normalize('la conquete spatiale', context(PRIORITIES));

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toMatch(/inconnue/i);
	});

	it('garde « ne se prononce pas » comme une reponse a part entiere', () => {
		// C est une reponse donnee : la fondre dans la question laissee vide la
		// faisait disparaitre des qu on retirait les non-reponses.
		const result = type.normalize('nsp', context(PRIORITIES));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.values[0]?.modalityKey).toBe('nsp');
	});

	it('expose « ne se prononce pas » a cote de la vraie non-reponse', () => {
		const modalities = type.modalities(context(PRIORITIES));
		const keys = modalities.map((modality) => modality.key);

		expect(keys).toEqual(['pouvoir_achat', 'sante', 'ecologie', 'nsp', NON_RESPONSE_KEY]);
		expect(modalities.at(-1)?.label).toBe('Sans réponse');
	});
});

describe('multiple_choice', () => {
	const type = requireQuestionType('multiple_choice');

	it('decoupe une cellule en plusieurs modalites', () => {
		const result = type.normalize('sante;ecologie', context(PRIORITIES, { separator: ';' }));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.values.map((value) => value.modalityKey)).toEqual(['sante', 'ecologie']);
	});

	it('accepte un tableau deja decoupe', () => {
		const result = type.normalize(['sante', 'ecologie'], context(PRIORITIES));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.values).toHaveLength(2);
	});

	it('ne compte qu une fois une modalite citee deux fois', () => {
		const result = type.normalize('sante;sante', context(PRIORITIES));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.values).toHaveLength(1);
	});

	it('compte « sans opinion » coche seul comme une reponse', () => {
		const result = type.normalize('nsp', context(PRIORITIES));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.values[0]?.modalityKey).toBe('nsp');
	});

	it('refuse plus de reponses que la limite declaree', () => {
		const result = type.normalize(
			'sante;ecologie;pouvoir_achat',
			context(PRIORITIES, { maxChoices: 2 })
		);

		expect(result.ok).toBe(false);
	});
});

describe('scale', () => {
	const type = requireQuestionType('scale');
	const config = { min: 1, max: 10, minLabel: 'pas du tout', maxLabel: 'tout a fait' };

	it('accepte une note dans les bornes', () => {
		const result = type.normalize('7', context([], config));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.values[0]?.modalityKey).toBe('7');
		expect(result.values[0]?.valueNumber).toBe(7);
	});

	it('refuse une note hors bornes', () => {
		expect(type.normalize('11', context([], config)).ok).toBe(false);
		expect(type.normalize('0', context([], config)).ok).toBe(false);
	});

	it('refuse une note non entiere', () => {
		expect(type.normalize('7,5', context([], config)).ok).toBe(false);
	});

	it('enumere tous les pas et libelle uniquement les bornes', () => {
		const modalities = type.modalities(context([], config));

		expect(modalities).toHaveLength(11); // 1 a 10, plus la non-reponse
		expect(modalities[0]?.label).toBe('1 (pas du tout)');
		expect(modalities[9]?.label).toBe('10 (tout a fait)');
		expect(modalities[4]?.label).toBe('5');
	});

	it('refuse une configuration aux bornes inversees', () => {
		expect(type.parseConfig({ min: 10, max: 1 }).ok).toBe(false);
	});
});

describe('number', () => {
	const type = requireQuestionType('number');
	const ages = { min: 18, max: 97, bucketSize: 10, bucketStart: 18, unit: 'ans' };

	it('regroupe une valeur dans sa tranche tout en conservant la valeur exacte', () => {
		const result = type.normalize('34', context([], ages));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// La tranche sert au croisement, la valeur exacte a l export brut.
		expect(result.values[0]?.modalityKey).toBe('28-37');
		expect(result.values[0]?.valueNumber).toBe(34);
	});

	it('accepte la virgule decimale', () => {
		const result = type.normalize('34,5', context([], { bucketSize: 10, bucketStart: 0 }));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.values[0]?.valueNumber).toBeCloseTo(34.5);
	});

	it('refuse une valeur hors bornes', () => {
		expect(type.normalize('12', context([], ages)).ok).toBe(false);
		expect(type.normalize('120', context([], ages)).ok).toBe(false);
	});

	it('refuse une valeur non numerique', () => {
		expect(type.normalize('trente', context([], ages)).ok).toBe(false);
	});

	it('garde la valeur brute comme modalite en l absence de tranches', () => {
		const result = type.normalize('34', context([], {}));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.values[0]?.modalityKey).toBe('34');
	});

	it('n enumere pas de modalites quand elles ne sont pas bornees', () => {
		// Sans tranches ni bornes, l agregation decouvrira les valeurs presentes.
		const modalities = type.modalities(context([], {}));

		expect(modalities).toHaveLength(1);
		expect(modalities[0]?.isNonResponse).toBe(true);
	});

	it('enumere les tranches quand elles sont declarees', () => {
		const modalities = type.modalities(context([], ages));
		const keys = modalities.map((modality) => modality.key);

		expect(keys[0]).toBe('18-27');
		expect(keys).toContain('88-97');
	});

	it('produit des tranches contigues et sans recouvrement', () => {
		const bucketing = { size: 10, start: 18 };

		expect(bucketKey(18, bucketing)).toBe('18-27');
		expect(bucketKey(27, bucketing)).toBe('18-27');
		expect(bucketKey(28, bucketing)).toBe('28-37');
	});

	it('utilise la valeur seule quand la tranche vaut 1', () => {
		expect(bucketKey(42, { size: 1, start: 0 })).toBe('42');
	});
});

describe('free_text', () => {
	const type = requireQuestionType('free_text');

	it('conserve le verbatim et le ramene a une modalite unique', () => {
		const result = type.normalize('  Il faut ecouter les gens.  ', context());

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.values[0]?.valueText).toBe('Il faut ecouter les gens.');
		// Compte « a repondu / sans reponse », jamais par contenu.
		expect(result.values[0]?.modalityKey).toBe('answered');
	});

	it('refuse un verbatim au-dela de la longueur declaree', () => {
		const result = type.normalize('x'.repeat(50), context([], { maxLength: 10 }));

		expect(result.ok).toBe(false);
	});
});

describe('findOption', () => {
	const OPTIONS: QuestionOptionLike[] = [
		option('ecologie', "L'ecologie", 0),
		option('sante', 'La sante', 1),
		option('nsp', 'Ne se prononce pas', 2, true)
	];

	it('reconnait le code exact', () => {
		expect(findOption(OPTIONS, 'sante')?.code).toBe('sante');
	});

	it('reconnait le libelle exact, casse et espaces ignores', () => {
		expect(findOption(OPTIONS, '  LA SANTE  ')?.code).toBe('sante');
	});

	it('tolere une apostrophe manquante', () => {
		// Un fichier reel ecrit « L ecologie » la ou la modalite s appelle
		// « L'ecologie » : perdre un entretien de terrain pour une apostrophe
		// serait absurde.
		expect(findOption(OPTIONS, 'L ecologie')?.code).toBe('ecologie');
	});

	it('tolere les accents manquants', () => {
		expect(findOption([option('sante', 'La santé', 0)], 'La sante')?.code).toBe('sante');
	});

	it('refuse de choisir quand deux modalites se ressemblent une fois normalisees', () => {
		// Deviner l intention de l operateur serait pire que signaler l ambiguite.
		const ambiguous = [option('a', "L'ecologie", 0), option('b', 'L ecologie', 1)];

		expect(findOption(ambiguous, 'l-ecologie')).toBeNull();
	});

	it('privilegie une correspondance exacte sur une correspondance souple', () => {
		const mixed = [option('l_ecologie', 'Autre chose', 0), option('ecologie', "L'ecologie", 1)];

		expect(findOption(mixed, "L'ecologie")?.code).toBe('ecologie');
	});

	it('rend null pour une valeur inconnue ou vide', () => {
		expect(findOption(OPTIONS, 'la conquete spatiale')).toBeNull();
		expect(findOption(OPTIONS, '   ')).toBeNull();
		expect(findOption(OPTIONS, '!!!')).toBeNull();
	});
});
