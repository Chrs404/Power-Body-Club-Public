import path from 'path';
import fs from 'fs';
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { env } from './config/env';
import { apiLimiter } from './middleware/rate-limit';

const app: Application = express();

/*
 * Dietro un proxy (Render, e in generale qualsiasi hosting gestito)
 * l'indirizzo della connessione e' quello del proxy, non dell'utente.
 * Senza questa impostazione il limite sulle richieste vedrebbe tutti gli
 * utenti come uno solo e li bloccherebbe insieme; express-rate-limit lo
 * segnala nei log con ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
 *
 * Il valore 1 significa "fidati di un solo proxy davanti": accettare
 * l'intera catena permetterebbe di falsificare l'indirizzo con un
 * header costruito ad arte, aggirando il limite.
 */
if (env.isProduction) {
  app.set('trust proxy', 1);
}

// In sviluppo accetta qualunque origine su localhost/127.0.0.1:
// evita blocchi CORS se il dev server parte su una porta diversa dalla 4200
// (succede quando la 4200 e' gia' occupata) o se si usa l'IP invece del nome.
// In produzione vale solo l'origine configurata in CORS_ORIGIN.
// In sviluppo accetta le origini locali e quelle della rete domestica
// (192.168.x.x, 10.x.x.x, 172.16-31.x.x): serve per aprire l'app dal
// telefono collegato allo stesso Wi-Fi. In produzione vale solo
// l'origine configurata in CORS_ORIGIN.
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const LAN_ORIGIN =
  /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

app.use(
  cors({
    origin: env.isProduction
      ? env.corsOrigin
      : (origin, callback) => {
          if (!origin || LOCAL_ORIGIN.test(origin) || LAN_ORIGIN.test(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Origine non consentita dalla policy CORS.'));
          }
        },
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Il limite generale vale per tutta l'API. Le rotte piu' delicate
// (accesso, creazione clienti) hanno limiti propri, piu' stretti.
app.use('/api', apiLimiter, routes);

// ---------------------------------------------------------------------------
// Modalita' a origine singola
//
// Se esiste la build del frontend, viene servita dallo stesso server delle API.
// Un solo indirizzo invece di due significa: nessun problema di CORS,
// un solo tunnel da esporre per le dimostrazioni, e la stessa struttura
// che servira' in produzione.
//
// Per attivarla: "npm run build" nella cartella frontend.
// ---------------------------------------------------------------------------
const FRONTEND_DIST = path.resolve(__dirname, '../../frontend/dist/frontend/browser');

if (fs.existsSync(path.join(FRONTEND_DIST, 'index.html'))) {
  app.use(
    express.static(FRONTEND_DIST, {
      // index.html non va messo in cache: contiene i riferimenti
      // ai file con hash, che cambiano a ogni build.
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    })
  );

  // Qualsiasi percorso non gestito dalle API restituisce index.html:
  // e' il routing lato client di Angular a decidere cosa mostrare.
  // Senza questo, ricaricare /cliente/scheda darebbe 404.
  app.get(/^\/(?!api).*/, (req: Request, res: Response) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });

  console.log('Frontend servito dalla stessa origine delle API');
}

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
