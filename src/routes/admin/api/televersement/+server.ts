import { json } from '@sveltejs/kit';
import { uploadImage } from '$lib/server/content/images';
import { requirePermission } from '$lib/server/rbac/guard';
import type { RequestHandler } from './$types';

/**
 * Televersement d'une image depuis un champ image.
 *
 * Point d'entree a part, et non une action de formulaire : le champ image vit
 * DANS le formulaire de sa section, et HTML interdit un formulaire dans un
 * formulaire. L'editeur de page n'a d'ailleurs aucune action de televersement,
 * et c'est ce qui obligeait a quitter l'apercu pour deposer une photo.
 *
 * Meme fonction et memes controles que l'action `uploadImage` de l'ecran de
 * formulaire : format, poids, nom assaini, dimensions relevees.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	requirePermission(locals.user, 'content.write');

	const form = await request.formData().catch(() => null);
	const file = form?.get('fichier');
	if (!(file instanceof File) || file.size === 0) {
		return json({ message: 'Choisissez un fichier image.' }, { status: 400 });
	}

	const result = await uploadImage(file);
	if (!result.ok) return json({ message: result.reason }, { status: 400 });

	return json({ image: result.image });
};
