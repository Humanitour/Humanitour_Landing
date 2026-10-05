#!/bin/sh
set -e

# Demarrage du conteneur.
#
# Les migrations sont appliquees AVANT que le serveur n'ecoute : demarrer sur un
# schema plus ancien que le code donnerait des erreurs a la premiere requete,
# sur des pages publiques.
#
# `migrate deploy` n'applique que les migrations deja ecrites et ne genere ni ne
# reinitialise rien. Sur une base qui contient deja les tables, la marquer comme
# a jour une seule fois :
#   bunx prisma migrate resolve --applied 0_init

if [ -z "${DATABASE_URL}" ]; then
	echo "DATABASE_URL est absente : le serveur ne peut pas demarrer." >&2
	exit 1
fi

# Un stockage inaccessible ne bloque pas le site public, mais chaque envoi de
# fichier du back-office echouerait en 500 : le dire des le demarrage, dans les
# journaux, plutot qu'a la premiere image deposee.
STORAGE_ROOT="${STORAGE_LOCAL_PATH:-./var/storage}"
if ! mkdir -p "${STORAGE_ROOT}" 2>/dev/null || [ ! -w "${STORAGE_ROOT}" ]; then
	echo "ATTENTION : le stockage ${STORAGE_ROOT} n'est pas accessible en ecriture. Les televersements echoueront. Laisser STORAGE_LOCAL_PATH vide ou la fixer a /var/storage." >&2
fi

echo "Application des migrations..."
node node_modules/prisma/build/index.js migrate deploy

exec "$@"
