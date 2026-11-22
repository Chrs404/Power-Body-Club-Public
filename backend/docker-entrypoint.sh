#!/bin/sh
# Avvio del contenitore del backend.
#
# RUN_MIGRATIONS=true  applica le migrazioni mancanti prima di partire.
# RUN_SEED=true        carica i dati iniziali (istruttore, orari, esercizi).
#                      E' rieseguibile: non duplica e non sovrascrive nulla.
#
# In locale (docker-compose.yml) sono entrambe attive. In produzione
# restano spente finche' non vengono impostate su Render.
set -e

if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Applico le migrazioni del database..."
  npx prisma migrate deploy
fi

if [ "$RUN_SEED" = "true" ]; then
  echo "Carico i dati iniziali..."
  node dist-seed/prisma/seed.js
fi

# exec: il server prende il posto dello script e riceve direttamente il
# segnale di arresto, cosi' chiude le connessioni prima di spegnersi.
exec node dist/server.js
