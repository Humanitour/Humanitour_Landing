# syntax=docker/dockerfile:1

# Image du site. Trois etapes : dependances, construction, execution.
#
# L'etape d'execution repart d'une image nue et ne recoit que le resultat : ni
# sources, ni outils de construction, ni dependances de developpement.

FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
# --ignore-scripts : `prepare` lance svelte-kit sync, qui exige les sources.
RUN bun install --frozen-lockfile --ignore-scripts

FROM deps AS build
WORKDIR /app
COPY . .
# svelte-kit sync cree .svelte-kit/tsconfig.json, que tsconfig.json etend :
# sans lui, le chargeur TypeScript de `prisma generate` echoue avant meme de
# lire prisma.config.ts. `--ignore-scripts` plus haut avait saute cette etape
# (le `prepare` de npm), il faut donc la rejouer ici, une fois les sources la.
RUN bunx svelte-kit sync && bunx prisma generate && bun run build

# Dependances de production seules, pour l'image finale.
#
# L'application construite est autonome, mais Prisma reste necessaire au
# demarrage : c'est lui qui applique les migrations avant que le serveur
# n'accepte la premiere requete.
FROM oven/bun:1-alpine AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts --production

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Taille maximale d'une requete. `adapter-node` la fixe a 512 Ko par defaut :
# une image de la mediatheque (8 Mo au plus) ou une piece jointe de la
# messagerie (25 Mo au plus, `shared/mail/attachments.ts`) serait refusee avant
# meme d'atteindre la route.
ENV BODY_SIZE_LIMIT=30M

# Le serveur ne tourne pas en root : une faille applicative ne doit pas donner
# les droits d'ecriture sur l'image.
RUN addgroup -g 1001 app && adduser -u 1001 -G app -s /bin/sh -D app

COPY --from=build --chown=app:app /app/build ./build
COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=app:app /app/prisma ./prisma
# Le client genere : `prisma migrate deploy` s'en passe, mais le garder evite
# une regeneration surprise si un script d'exploitation en a besoin.
COPY --from=build --chown=app:app /app/src/lib/server/prisma-client ./src/lib/server/prisma-client
COPY --chown=app:app docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Depots des medias et des fichiers d'import. Monte en volume : sans cela, les
# fichiers deposes disparaitraient au premier redeploiement.
RUN mkdir -p /var/storage && chown app:app /var/storage
# Sans cette variable, le stockage retombe sur `./var/storage`, soit `/app/var`,
# que l'utilisateur `app` ne peut pas creer : l'envoi d'une piece jointe
# echouait en EACCES.
ENV STORAGE_LOCAL_PATH=/var/storage
# L'hebergeur peut ecraser la variable avec la valeur de `.env.example`
# (`./var/storage`) : le lien fait alors pointer ce chemin sur le volume, au
# lieu d'un dossier que `app` ne peut pas creer ou qu'un redeploiement viderait.
RUN mkdir -p /app/var && ln -s /var/storage /app/var/storage
VOLUME ["/var/storage"]

USER app
EXPOSE 3000

# Le conteneur se declare pret quand le serveur repond vraiment, pas quand le
# processus existe : l'orchestrateur ne bascule pas le trafic trop tot.
#
# La sonde ne touche pas a la base : une panne de PostgreSQL ferait autrement
# redemarrer le site en boucle, ce qui empilerait une indisponibilite sur une
# autre au lieu de laisser les pages servir ce qu'elles peuvent encore servir.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/sante').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "build"]
