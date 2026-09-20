import { Router, Request, Response } from 'express';

const router = Router();

/*
 * Versione minima richiesta dell'app.
 *
 * Serve quando una modifica al backend rende inutilizzabili le versioni
 * precedenti: per esempio un endpoint che cambia forma, o un campo nuovo
 * indispensabile. Alzando questo numero, le app piu' vecchie mostrano
 * una schermata che invita ad aggiornare invece di fallire con errori
 * incomprensibili.
 *
 * Il valore sta in una variabile d'ambiente per poterlo cambiare su
 * Render senza ridistribuire il codice.
 */
const VERSIONE_MINIMA = process.env.MIN_APP_VERSION ?? '1.0.0';

/** Dove scaricare la versione nuova. Vuoto finche' non c'e' un canale. */
const URL_AGGIORNAMENTO = process.env.APP_UPDATE_URL ?? '';

/**
 * Non richiede autenticazione: l'app deve poter sapere se e' obsoleta
 * anche prima di accedere, altrimenti un utente con una versione vecchia
 * resterebbe bloccato al login senza capire perche'.
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    success: true,
    minVersion: VERSIONE_MINIMA,
    updateUrl: URL_AGGIORNAMENTO,
  });
});

export default router;
