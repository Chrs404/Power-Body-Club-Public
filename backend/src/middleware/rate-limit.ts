import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/**
 * Limite sui tentativi di accesso.
 *
 * Senza, chiunque conosca l'indirizzo del backend puo' provare password
 * all'infinito. Lo username dell'istruttore e' prevedibile, quindi
 * l'unica difesa sarebbe la lunghezza della password.
 *
 * Il conteggio e' per indirizzo IP e riguarda solo i tentativi falliti:
 * un accesso riuscito azzera il contatore, cosi' chi usa l'app
 * normalmente non incontra mai il limite.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,

  /*
   * Il conteggio e' per indirizzo IP e username insieme, non per solo IP.
   *
   * In palestra tutti i clienti passano dallo stesso Wi-Fi, e le reti
   * mobili condividono l'indirizzo fra molti utenti. Contando solo l'IP,
   * chi sbaglia ripetutamente la propria password bloccherebbe l'accesso
   * a tutti gli altri sulla stessa rete.
   *
   * Cosi' invece il blocco colpisce chi insiste su un singolo account:
   * un attacco a forza bruta su "istruttore" si ferma dopo venti
   * tentativi, mentre gli altri continuano ad accedere normalmente.
   */
  keyGenerator: (req) => {
    const corpo = req.body as { username?: unknown } | undefined;
    const username =
      typeof corpo?.username === 'string'
        ? corpo.username.trim().toLowerCase()
        : 'sconosciuto';
    return `${ipKeyGenerator(req.ip ?? '')}:${username}`;
  },

  message: {
    success: false,
    message:
      'Troppi tentativi di accesso per questo utente. Riprova fra qualche minuto.',
  },
});

/**
 * Limite generale sull'API.
 *
 * Ampio di proposito: un cliente che apre la scheda, spunta esercizi e
 * registra pesi fa decine di richieste in pochi minuti. Serve a contenere
 * un uso anomalo, non a ostacolare quello normale.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Troppe richieste. Attendi qualche istante.',
  },
});

/**
 * Limite sulle operazioni che generano credenziali.
 *
 * Creare clienti e reimpostare password sono azioni rare e delicate:
 * un ritmo elevato indica un problema, non un uso legittimo.
 */
export const sensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Troppe operazioni consecutive. Riprova fra un\'ora.',
  },
});
