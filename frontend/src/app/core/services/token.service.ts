import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { User } from '../models/user.model';

const TOKEN_KEY = 'gym_token';
const USER_KEY = 'gym_user';

/** Legge dal localStorage senza mai lanciare: puo' essere disattivato. */
function leggiLocale(chiave: string): string | null {
  try {
    return localStorage.getItem(chiave);
  } catch {
    return null;
  }
}

function rimuoviLocale(chiave: string): void {
  try {
    localStorage.removeItem(chiave);
  } catch {
    // Niente da rimuovere.
  }
}

/**
 * Unico punto di accesso ai dati di sessione salvati sul dispositivo.
 *
 * Oltre al token conserva una copia del profilo: serve a far partire
 * l'app senza attendere il server. Su Render il backend va in pausa
 * dopo 15 minuti di inattività, quindi alla prima apertura la risposta
 * può richiedere una trentina di secondi: senza una copia locale
 * l'utente resterebbe fermo sul caricamento ogni volta.
 *
 * La copia non e' una fonte di verita': serve solo a mostrare subito
 * qualcosa. Il token resta l'unica cosa che il server verifica, e chi
 * modificasse la copia a mano otterrebbe soltanto un'interfaccia
 * sbagliata per qualche istante, finche' la verifica non lo smentisce.
 *
 * DOVE: nella memoria nativa del telefono, tramite il plugin Preferences
 * (su Android sono le SharedPreferences). Fino alla versione 1.0.1 i dati
 * stavano nel localStorage della WebView, che Android puo' svuotare
 * quando lo spazio scarseggia: e' la documentazione di Capacitor a
 * sconsigliarlo per dati da conservare. Nel browser Preferences usa
 * comunque il localStorage, quindi il sito funziona come prima.
 *
 * COME: Preferences risponde in modo asincrono, ma il token serve in modo
 * sincrono (l'intercettore lo aggiunge a ogni richiesta). I valori vengono
 * quindi letti una volta sola all'avvio, in carica(), e poi tenuti in
 * memoria; ogni modifica aggiorna la memoria subito e il disco in coda.
 */
@Injectable({ providedIn: 'root' })
export class TokenService {
  private token: string | null = null;
  /** Profilo salvato, cosi' come e' scritto su disco (JSON). */
  private profilo: string | null = null;
  private caricato = false;

  /**
   * Scritture su disco, eseguite una dopo l'altra nell'ordine in cui
   * sono state chieste: un logout non deve poter essere superato da un
   * salvataggio del token partito un istante prima.
   */
  private coda: Promise<void> = Promise.resolve();

  /**
   * Legge la sessione salvata. Va chiamato all'avvio, prima di ogni
   * altro uso del servizio: lo fa sessionInitializer.
   */
  async carica(): Promise<void> {
    if (this.caricato) return;

    try {
      const [token, profilo] = await Promise.all([
        Preferences.get({ key: TOKEN_KEY }),
        Preferences.get({ key: USER_KEY }),
      ]);
      this.token = token.value;
      this.profilo = profilo.value;
    } catch {
      // Plugin non disponibile: si resta sul localStorage, come prima.
      this.token = leggiLocale(TOKEN_KEY);
      this.profilo = leggiLocale(USER_KEY);
      this.caricato = true;
      return;
    }

    if (this.token === null) {
      await this.migraDalLocalStorage();
    }
    this.caricato = true;
  }

  /**
   * Chi ha fatto l'accesso con una versione precedente ha il token nel
   * localStorage: lo si sposta, cosi' l'aggiornamento non lo disconnette.
   * Il vecchio valore si cancella solo DOPO aver scritto il nuovo: se la
   * scrittura fallisse, la sessione resterebbe comunque dove era.
   */
  private async migraDalLocalStorage(): Promise<void> {
    const vecchioToken = leggiLocale(TOKEN_KEY);
    if (!vecchioToken) return;

    const vecchioProfilo = leggiLocale(USER_KEY);
    this.token = vecchioToken;
    this.profilo = vecchioProfilo;

    try {
      await Preferences.set({ key: TOKEN_KEY, value: vecchioToken });
      if (vecchioProfilo) {
        await Preferences.set({ key: USER_KEY, value: vecchioProfilo });
      }
      rimuoviLocale(TOKEN_KEY);
      rimuoviLocale(USER_KEY);
    } catch {
      // Resta nel localStorage: al prossimo avvio si riprova.
    }
  }

  getToken(): string | null {
    return this.token;
  }

  setToken(token: string): void {
    this.token = token;
    this.scrivi(() => Preferences.set({ key: TOKEN_KEY, value: token }));
  }

  /** Cancella l'intera sessione: token e profilo salvato. */
  clearToken(): void {
    this.token = null;
    this.profilo = null;
    this.scrivi(async () => {
      await Preferences.remove({ key: TOKEN_KEY });
      await Preferences.remove({ key: USER_KEY });
    });
    // Eventuali residui di una versione precedente.
    rimuoviLocale(TOKEN_KEY);
    rimuoviLocale(USER_KEY);
  }

  hasToken(): boolean {
    return this.token !== null;
  }

  /** Profilo della sessione precedente, se presente e leggibile. */
  getCachedUser(): User | null {
    if (!this.profilo) return null;

    try {
      return JSON.parse(this.profilo) as User;
    } catch {
      // Dato corrotto: si riparte dalla verifica sul server.
      this.profilo = null;
      this.scrivi(() => Preferences.remove({ key: USER_KEY }));
      return null;
    }
  }

  setCachedUser(user: User): void {
    const valore = JSON.stringify(user);
    this.profilo = valore;
    this.scrivi(() => Preferences.set({ key: USER_KEY, value: valore }));
  }

  private scrivi(operazione: () => Promise<unknown>): void {
    this.coda = this.coda
      .then(operazione)
      .then(() => undefined)
      .catch(() => undefined);
  }

  /** Attende che le scritture in coda siano su disco. Utile nei test. */
  attendiScritture(): Promise<void> {
    return this.coda;
  }
}
