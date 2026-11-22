import { Injectable, computed, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';

/*
 * Suoneria di fine recupero, sul modello delle sveglie digitali:
 * quattro bip ravvicinati, una pausa, e di nuovo, finche' qualcuno
 * non la ferma.
 *
 * Il volume e' al limite: misurato nel motore audio di Chromium (lo
 * stesso della WebView di Android), il picco arriva a 0.94 del fondo
 * scala. Oltre 1 il segnale verrebbe tagliato e distorto; da qui in su
 * conta solo il volume multimediale del telefono.
 */
const SVEGLIA = {
  /** Hz. Il tono dei cicalini delle sveglie, e quello che gli altoparlanti dei telefoni rendono meglio. */
  frequenza: 2400,
  volume: 0.95,
  /** Secondi di suono di ciascun bip. */
  bip: 0.07,
  /** Silenzio fra un bip e l'altro dello stesso gruppo. */
  pausaBip: 0.06,
  bipPerGruppo: 4,
  /** Ogni quanto riparte il gruppo di bip. */
  ciclo: 1.0,
  /**
   * Durata massima. Una sveglia vera suona finche' non la spegni, ma un
   * telefono dimenticato sulla panca non deve suonare per tutta la sera.
   */
  durataMassima: 30,
} as const;

/** Lunghezza massima di uno schema di vibrazione accettata da Chrome/WebView. */
const VALORI_VIBRAZIONE_MAX = 99;

/** Passo dei pulsanti "+20 s" e "-20 s". */
export const PASSO_RECUPERO = 20;

/** Notifica di fine recupero sull'app Android (sempre la stessa, si sostituisce). */
const ID_NOTIFICA = 4242;
const CANALE_NOTIFICA = 'recupero';

/**
 * Timer di recupero, unico per tutta l'app.
 *
 * Prima il timer era un componente dentro la pagina Scheda e si apriva
 * a tutto schermo: finche' contava non si poteva fare altro. Ora vive in
 * un servizio, quindi sopravvive ai cambi di pagina, e si mostra in due
 * modi: una barra in basso (si continua a usare l'app) o a tutto schermo.
 *
 * Usa un istante di scadenza invece di decrementare un contatore:
 * i browser mobile rallentano i timer quando la scheda perde il fuoco,
 * quindi un conteggio a decremento perderebbe secondi.
 *
 * Con l'app Android in secondo piano il JavaScript si ferma: per non
 * perdere la fine del recupero, uscendo dall'app si programma una
 * notifica di sistema all'istante di scadenza, e la si annulla al rientro.
 */
@Injectable({ providedIn: 'root' })
export class RestTimerService {
  /** Vero da quando si avvia il recupero a quando lo si chiude. */
  readonly attivo = signal(false);
  /** A tutto schermo invece che nella barra in basso. */
  readonly schermoIntero = signal(false);
  readonly finito = signal(false);
  /** Secondi rimanenti, aggiornati piu' volte al secondo. */
  readonly rimanenti = signal(0);
  /** Durata di riferimento per l'anello di avanzamento. */
  readonly totale = signal(0);
  /** Esercizio o superset a cui si riferisce. */
  readonly etichetta = signal('');

  readonly testo = computed(() => {
    const t = Math.max(0, this.rimanenti());
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  });

  /** Frazione ancora da recuperare, da 1 a 0. */
  readonly avanzamento = computed(() => {
    const totale = this.totale();
    if (totale <= 0) return 0;
    return Math.max(0, Math.min(1, this.rimanenti() / totale));
  });

  /** Ultimi 10 secondi: preavviso visivo. */
  readonly inArrivo = computed(
    () => this.attivo() && !this.finito() && this.rimanenti() <= 10
  );

  private scadenza = 0;
  private intervallo?: ReturnType<typeof setInterval>;
  private wakeLock: WakeLockSentinel | null = null;
  private audioCtx?: AudioContext;
  private suoneria: { osc: OscillatorNode; gain: GainNode } | null = null;

  private readonly nativa = Capacitor.isNativePlatform();
  private notifichePronte = false;
  private inSecondoPiano = false;

  constructor() {
    if (this.nativa) {
      void App.addListener('appStateChange', ({ isActive }) => this.cambioStato(!isActive));
    }
  }

  // ------------------------------------------------------------ comandi

  /** Avvia un recupero, sostituendo quello eventualmente in corso. */
  avvia(secondi: number, etichetta: string): void {
    // Qui, e non alla fine del recupero: questo e' l'unico momento in
    // cui c'e' un tocco dell'utente, e Android sblocca l'audio solo in
    // risposta a un gesto.
    this.preparaAudio();
    void this.preparaNotifiche();
    void this.acquisisciWakeLock();

    this.etichetta.set(etichetta);
    this.totale.set(secondi);
    this.attivo.set(true);
    this.riparti(secondi);
  }

  /** Ricomincia il recupero corrente dalla sua durata piena. */
  riavvia(): void {
    if (!this.attivo()) return;
    this.preparaAudio();
    this.riparti(this.totale());
  }

  /** Aggiunge (o toglie, con un valore negativo) secondi al recupero. */
  modifica(delta: number): void {
    if (!this.attivo()) return;
    this.preparaAudio();

    const base = this.finito() ? 0 : Math.max(0, this.scadenza - Date.now()) / 1000;
    const nuovi = Math.max(0, Math.round(base + delta));

    if (nuovi === 0) {
      this.rimanenti.set(0);
      this.completa();
      return;
    }

    // Allungando oltre la durata iniziale l'anello riparte pieno.
    if (nuovi > this.totale()) this.totale.set(nuovi);
    this.riparti(nuovi);
  }

  espandi(): void {
    this.schermoIntero.set(true);
  }

  riduci(): void {
    this.schermoIntero.set(false);
  }

  /** Chiude il recupero, spegnendo suono, vibrazione e notifica. */
  chiudi(): void {
    this.fermaIntervallo();
    this.fermaSveglia();
    void this.annullaNotifica();
    this.attivo.set(false);
    this.finito.set(false);
    this.schermoIntero.set(false);
    void this.rilasciaWakeLock();
  }

  // ------------------------------------------------------------ conteggio

  private riparti(secondi: number): void {
    this.fermaIntervallo();
    this.fermaSveglia();
    this.finito.set(false);
    this.scadenza = Date.now() + secondi * 1000;
    this.rimanenti.set(secondi);

    this.intervallo = setInterval(() => this.aggiorna(), 200);
    if (this.inSecondoPiano) void this.programmaNotifica();
  }

  private aggiorna(): void {
    const rimasti = Math.round((this.scadenza - Date.now()) / 1000);
    this.rimanenti.set(Math.max(0, rimasti));
    if (rimasti <= 0) this.completa();
  }

  private completa(): void {
    this.fermaIntervallo();
    this.finito.set(true);
    // In primo piano avvisa l'app; in secondo piano ci pensa la notifica.
    if (!this.inSecondoPiano) {
      void this.annullaNotifica();
      this.vibra();
      this.suonaSveglia();
    }
  }

  private fermaIntervallo(): void {
    if (this.intervallo) {
      clearInterval(this.intervallo);
      this.intervallo = undefined;
    }
  }

  // ------------------------------------------------------- app in background

  private cambioStato(inSecondoPiano: boolean): void {
    this.inSecondoPiano = inSecondoPiano;
    if (!this.attivo() || this.finito()) return;

    if (inSecondoPiano) {
      void this.programmaNotifica();
    } else {
      // Rientrando nell'app la notifica non serve piu': se il recupero e'
      // finito mentre si era fuori, se ne occupa il primo aggiornamento.
      void this.annullaNotifica();
      this.aggiorna();
    }
  }

  /**
   * Permesso e canale delle notifiche, chiesti una volta sola al primo
   * recupero. Senza permesso il timer funziona comunque, solo senza
   * avviso a schermo spento.
   */
  private async preparaNotifiche(): Promise<void> {
    if (!this.nativa || this.notifichePronte) return;
    try {
      const permesso = await LocalNotifications.requestPermissions();
      if (permesso.display !== 'granted') return;

      await LocalNotifications.createChannel({
        id: CANALE_NOTIFICA,
        name: 'Fine recupero',
        description: 'Avviso quando il recupero fra una serie e l\'altra e\' finito',
        importance: 5,
        visibility: 1,
        vibration: true,
      });
      this.notifichePronte = true;
    } catch {
      // Notifiche non disponibili: resta l'avviso con l'app aperta.
    }
  }

  private async programmaNotifica(): Promise<void> {
    if (!this.nativa || !this.notifichePronte) return;
    try {
      await LocalNotifications.cancel({ notifications: [{ id: ID_NOTIFICA }] });
      const quando = new Date(Math.max(this.scadenza, Date.now() + 1000));
      await LocalNotifications.schedule({
        notifications: [
          {
            id: ID_NOTIFICA,
            title: 'Recupero finito',
            body: this.etichetta() ? `Tocca a te: ${this.etichetta()}` : 'Tocca a te.',
            channelId: CANALE_NOTIFICA,
            schedule: { at: quando, allowWhileIdle: true },
          },
        ],
      });
    } catch {
      // Programmazione negata: nessuna conseguenza sul timer.
    }
  }

  private async annullaNotifica(): Promise<void> {
    if (!this.nativa || !this.notifichePronte) return;
    try {
      await LocalNotifications.cancel({ notifications: [{ id: ID_NOTIFICA }] });
    } catch {
      // Gia' annullata.
    }
  }

  // -------------------------------------------------------------- avviso

  /**
   * Vibrazione allineata ai bip.
   *
   * Dura meno della sveglia: Chrome e la WebView di Android accettano
   * schemi di vibrazione lunghi al massimo 99 valori e scartano il resto.
   */
  private vibra(): void {
    try {
      if (!('vibrate' in navigator)) return;

      const bip = Math.round(SVEGLIA.bip * 1000);
      const pausa = Math.round(SVEGLIA.pausaBip * 1000);
      const gruppo: number[] = [];
      for (let i = 0; i < SVEGLIA.bipPerGruppo; i++) {
        gruppo.push(bip, pausa);
      }
      const durataGruppo = gruppo.reduce((a, b) => a + b, 0);
      gruppo[gruppo.length - 1] += Math.round(SVEGLIA.ciclo * 1000) - durataGruppo;

      const gruppiTotali = SVEGLIA.durataMassima / SVEGLIA.ciclo;
      const gruppiAmmessi = Math.floor(VALORI_VIBRAZIONE_MAX / gruppo.length);
      const schema: number[] = [];
      for (let c = 0; c < Math.min(gruppiTotali, gruppiAmmessi); c++) {
        schema.push(...gruppo);
      }
      navigator.vibrate(schema);
    } catch {
      // Non supportata o negata: restano suono e segnale visivo.
    }
  }

  /** Crea il contesto audio, o lo risveglia se il sistema l'ha sospeso. */
  private preparaAudio(): void {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) return;

      this.audioCtx ??= new Ctx();
      if (this.audioCtx.state === 'suspended') void this.audioCtx.resume();
    } catch {
      // Audio non disponibile: restano vibrazione e segnale visivo.
    }
  }

  /**
   * Suoneria generata al momento, senza file audio da scaricare: un solo
   * oscillatore a onda quadra, con i bip disegnati sul suo volume e
   * programmati subito sull'orologio audio, cosi' il ritmo resta regolare
   * anche se il telefono rallenta il resto dell'app.
   */
  private suonaSveglia(): void {
    try {
      this.preparaAudio();
      const ctx = this.audioCtx;
      if (!ctx) return;
      this.fermaSveglia();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = SVEGLIA.frequenza;

      const rampa = 0.004;
      const inizio = ctx.currentTime + 0.02;
      const fine = inizio + SVEGLIA.durataMassima;

      gain.gain.setValueAtTime(0, inizio);
      for (let ciclo = inizio; ciclo < fine; ciclo += SVEGLIA.ciclo) {
        for (let i = 0; i < SVEGLIA.bipPerGruppo; i++) {
          const on = ciclo + i * (SVEGLIA.bip + SVEGLIA.pausaBip);
          const off = on + SVEGLIA.bip;
          gain.gain.setValueAtTime(0, on);
          gain.gain.linearRampToValueAtTime(SVEGLIA.volume, on + rampa);
          gain.gain.setValueAtTime(SVEGLIA.volume, off - rampa);
          gain.gain.linearRampToValueAtTime(0, off);
        }
      }

      osc.connect(gain).connect(ctx.destination);
      osc.start(inizio);
      osc.stop(fine);
      osc.onended = () => {
        if (this.suoneria?.osc === osc) this.suoneria = null;
      };
      this.suoneria = { osc, gain };
    } catch {
      // Audio non disponibile: restano vibrazione e segnale visivo.
    }
  }

  /** Spegne la sveglia e la vibrazione, se sono in corso. */
  private fermaSveglia(): void {
    try {
      if ('vibrate' in navigator) navigator.vibrate(0);
    } catch {
      // Niente da fermare.
    }

    const s = this.suoneria;
    this.suoneria = null;
    if (!s || !this.audioCtx) return;

    try {
      // Sfumatura di 20 ms: spegnere a volume pieno produrrebbe uno schiocco.
      const ora = this.audioCtx.currentTime;
      s.gain.gain.cancelScheduledValues(ora);
      s.gain.gain.setValueAtTime(s.gain.gain.value, ora);
      s.gain.gain.linearRampToValueAtTime(0, ora + 0.02);
      s.osc.stop(ora + 0.03);
    } catch {
      // Gia' fermata.
    }
  }

  // ------------------------------------------------------- schermo acceso

  /** Lo schermo resta acceso finche' il timer e' aperto, dove supportato. */
  private async acquisisciWakeLock(): Promise<void> {
    try {
      if (this.wakeLock || !('wakeLock' in navigator)) return;
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => {
        this.wakeLock = null;
      });
    } catch {
      // Negato o non supportato: nessuna conseguenza sul funzionamento.
    }
  }

  private async rilasciaWakeLock(): Promise<void> {
    try {
      await this.wakeLock?.release();
    } catch {
      // Gia' rilasciato.
    } finally {
      this.wakeLock = null;
    }
  }
}
