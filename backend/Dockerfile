# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Immagine del backend Power Body Club.
#
# La stessa immagine gira in locale (docker compose) e in produzione
# (Render): cio' che funziona sul PC e' esattamente cio' che va online.
#
# Due fasi: nella prima si compila TypeScript con tutti gli strumenti di
# sviluppo; nella seconda resta solo il necessario per eseguire, cosi'
# l'immagine finale e' piu' piccola e contiene meno software da tenere
# aggiornato.
# ---------------------------------------------------------------------------

FROM node:22-bookworm-slim AS base
# OpenSSL serve a Prisma; i certificati alla connessione cifrata con Neon.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- Fase 1: compilazione ---------------------------------------------------
FROM base AS build

# Prima i soli elenchi delle dipendenze: finche' non cambiano, Docker
# riusa lo strato gia' pronto e non riscarica tutto a ogni modifica.
COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src

# dist/       -> il server (npm run build)
# dist-seed/  -> lo script dei dati iniziali, che sta fuori da src/
RUN npx prisma generate \
  && npm run build \
  && npx tsc prisma/seed.ts --outDir dist-seed --rootDir . \
       --module commonjs --target es2022 --moduleResolution node \
       --esModuleInterop --skipLibCheck

# --- Fase 2: esecuzione -----------------------------------------------------
FROM base AS runtime

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Lo schema e le migrazioni servono anche qui: "prisma migrate deploy"
# le applica all'avvio quando RUN_MIGRATIONS=true.
COPY prisma ./prisma
RUN npx prisma generate

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-seed ./dist-seed
# Logo usato nelle schede in PDF.
COPY assets ./assets

# Su Windows git puo' salvare lo script con i ritorni a capo di Windows,
# che dentro Linux lo rendono ineseguibile: si normalizza qui.
COPY docker-entrypoint.sh ./
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

# Utente senza privilegi: un difetto nel server non da' accesso da
# amministratore al contenitore.
USER node

EXPOSE 3000

# Docker segnala "unhealthy" se l'API smette di rispondere.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
