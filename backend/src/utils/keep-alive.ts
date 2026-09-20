/**
 * Mantiene sveglio il servizio su Render, dall'interno del backend.
 *
 * =========================================================================
 * PRIMA DI ATTIVARLO
 * =========================================================================
 *
 * Render indica il traffico generato al solo scopo di evitare la pausa
 * come "traffico anomalo", e lo elenca fra i motivi di sospensione
 * dell'account. La soluzione supportata e' il piano Starter (7 $/mese).
 *
 * Questo modulo e' DISATTIVATO per impostazione predefinita: entra in
 * funzione solo se viene impostata la variabile KEEP_ALIVE_URL.
 * Per spegnerlo, basta rimuovere quella variabile: nessuna modifica al
 * codice, nessuna ridistribuzione.
 *
 * =========================================================================
 * PERCHE' L'INDIRIZZO PUBBLICO E NON localhost
 * =========================================================================
 *
 * Render decide se mettere in pausa un servizio guardando le richieste
 * che passano dal suo instradatore. Una richiesta a localhost resta
 * dentro il contenitore, non passa di li' e non conta: il servizio si
 * addormenterebbe comunque, con l'aggravante di consumare risorse per
 * nulla. L'indirizzo da usare e' quindi quello pubblico.
 *
 * =========================================================================
 * LA FINESTRA ORARIA
 * =========================================================================
 *
 * Tenere il servizio sveglio ventiquattro ore su ventiquattro consuma
 * circa 730 ore al mese, cioe' quasi per intero le 750 incluse nel
 * piano gratuito: nessun margine per un secondo servizio o per un
 * imprevisto, e al superamento Render sospende tutto fino al mese dopo.
 *
 * Limitando il ping agli orari di apertura della palestra, il consumo
 * scende a circa 450 ore (15 ore al giorno) e resta dentro il limite
 * con un margine ampio. Fuori da quella fascia il servizio si addormenta
 * come farebbe normalmente: nessuno lo sta usando.
 */

const INTERVALLO_MINUTI = 12;

interface ConfigurazioneKeepAlive {
  url: string;
  oraInizio: number;
  oraFine: number;
}

/**
 * Legge la configurazione dalle variabili d'ambiente.
 * Restituisce null se il keep-alive non e' stato attivato.
 */
function leggiConfigurazione(): ConfigurazioneKeepAlive | null {
  const url = process.env.KEEP_ALIVE_URL?.trim();
  if (!url) return null;

  if (!/^https?:\/\//i.test(url)) {
    console.warn('[keep-alive] KEEP_ALIVE_URL non e\' un indirizzo valido: ignorato.');
    return null;
  }

  // Formato "7-22": dalle 7 del mattino alle 22. Senza la variabile,
  // il ping resta attivo tutto il giorno.
  const fascia = process.env.KEEP_ALIVE_HOURS?.trim();
  let oraInizio = 0;
  let oraFine = 24;

  if (fascia) {
    const trovato = /^(\d{1,2})-(\d{1,2})$/.exec(fascia);
    if (trovato) {
      oraInizio = Number(trovato[1]);
      oraFine = Number(trovato[2]);
    } else {
      console.warn('[keep-alive] KEEP_ALIVE_HOURS ignorato: formato atteso "7-22".');
    }
  }

  return { url, oraInizio, oraFine };
}

/**
 * Vero se l'ora corrente rientra nella fascia configurata.
 *
 * L'ora e' calcolata sul fuso italiano e non su quello del server, che
 * su Render e' UTC: una fascia "7-22" deve corrispondere agli orari
 * della palestra, non a quelli di Greenwich.
 */
export function dentroLaFascia(
  adesso: Date,
  oraInizio: number,
  oraFine: number
): boolean {
  if (oraInizio === 0 && oraFine === 24) return true;

  const ora = Number(
    new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome',
      hour: 'numeric',
      hour12: false,
    }).format(adesso)
  );

  // Fascia che scavalca la mezzanotte, es. "22-6"
  if (oraInizio > oraFine) {
    return ora >= oraInizio || ora < oraFine;
  }

  return ora >= oraInizio && ora < oraFine;
}

export function avviaKeepAlive(): NodeJS.Timeout | null {
  const config = leggiConfigurazione();
  if (!config) return null;

  const fascia =
    config.oraInizio === 0 && config.oraFine === 24
      ? 'tutto il giorno'
      : `dalle ${config.oraInizio} alle ${config.oraFine} (ora italiana)`;

  console.log(`[keep-alive] attivo ogni ${INTERVALLO_MINUTI} minuti, ${fascia}`);

  const timer = setInterval(
    () => void eseguiPing(config),
    INTERVALLO_MINUTI * 60 * 1000
  );

  /*
   * unref() lascia che il processo termini anche con il timer in attesa:
   * senza, la chiusura ordinata resterebbe appesa fino al ping successivo,
   * e Render finirebbe per terminare il processo a forza.
   */
  timer.unref();

  return timer;
}

async function eseguiPing(config: ConfigurazioneKeepAlive): Promise<void> {
  if (!dentroLaFascia(new Date(), config.oraInizio, config.oraFine)) {
    return;
  }

  try {
    // Il timeout evita che una richiesta bloccata resti appesa fino al
    // ping successivo, accumulando connessioni aperte.
    const controller = new AbortController();
    const scadenza = setTimeout(() => controller.abort(), 20_000);

    const risposta = await fetch(config.url, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(scadenza);

    if (!risposta.ok) {
      console.warn(`[keep-alive] risposta inattesa: ${risposta.status}`);
    }
  } catch {
    // Un ping fallito non e' un problema: al massimo il servizio si
    // addormenta e si risveglia alla prima richiesta di un utente.
    // Registrarlo come errore riempirebbe i log senza motivo.
  }
}
