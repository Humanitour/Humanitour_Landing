import { z } from 'zod';
import {
	declaredModalities,
	findOption,
	isBlank,
	nonResponseModality,
	nonResponseValue,
	type ModalityDescriptor,
	type NormalizeResult,
	type QuestionType
} from './types';

const configSchema = z.object({}).loose();

export const singleChoice: QuestionType = {
	key: 'single_choice',
	label: 'Choix unique',
	description: 'Une seule réponse parmi une liste de modalités déclarées.',
	usesOptions: true,
	multiValued: false,
	ordered: false,
	crossable: true,
	parseConfig(raw) {
		const parsed = configSchema.safeParse(raw ?? {});
		if (!parsed.success) return { ok: false, reason: 'Configuration invalide.' };
		return { ok: true, config: parsed.data };
	},
	normalize(raw, context): NormalizeResult {
		if (isBlank(raw)) return { ok: true, values: [nonResponseValue()] };
		if (typeof raw !== 'string' && typeof raw !== 'number') {
			return { ok: false, reason: 'Valeur attendue : un texte ou un nombre.' };
		}
		const option = findOption(context.options, String(raw));
		if (!option) {
			return { ok: false, reason: `Modalité inconnue : « ${String(raw).trim()} ».` };
		}
		return {
			ok: true,
			values: [
				{
					modalityKey: option.code,
					optionCode: option.code,
					valueNumber: null,
					valueText: null
				}
			]
		};
	},
	modalities(context): readonly ModalityDescriptor[] {
		return [...declaredModalities(context.options), nonResponseModality(context.options)];
	}
};
