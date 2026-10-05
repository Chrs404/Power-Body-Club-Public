import {
  Component, Input, signal, computed, OnDestroy,
} from '@angular/core';
import { IonButton, IonIcon, IonModal, IonContent } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  timerOutline, refreshOutline, closeOutline, checkmarkCircle,
} from 'ionicons/icons';

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

/**
 * Timer di recupero. Si apre a tutto schermo per essere leggibile
 * con il telefono appoggiato durante la serie.
 *
 * Usa un istante di scadenza invece di decrementare un contatore:
 * i browser mobile rallentano i timer quando la scheda perde il fuoco,
 * quindi un conteggio a decremento perderebbe secondi.
 */
@Component({
  selector: 'app-rest-timer',
  imports: [IonButton, IonIcon, IonModal, IonContent],
  templateUrl: './rest-timer.component.html',
  styleUrl: './rest-timer.component.css',
})
export class RestTimerComponent implements OnDestroy {
  @Input({ required: true }) seconds = 60;
  @Input() exerciseName = '';

  readonly open = signal(false);
  readonly remaining = signal(0);
  readonly running = signal(false);
  readonly finished = signal(false);

  private intervalId?: ReturnType<typeof setInterval>;
  private endsAt = 0;
  private wakeLock: WakeLockSentinel | null = null;
  private audioCtx?: AudioContext;

  /** Oscillatore e volume della sveglia in corso, per poterla fermare. */
  private suoneria: { osc: OscillatorNode; gain: GainNode } | null = null;

  readonly display = computed(() => {
    const total = Math.max(0, this.remaining());
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : String(s);
  });

  readonly progress = computed(() => {
    if (this.seconds <= 0) return 0;
    return Math.max(0, Math.min(1, this.remaining() / this.seconds));
  });

  /** Ultimi 10 secondi: il cerchio passa all'ocra come preavviso. */
  readonly inArrivo = computed(
    () => this.running() && this.remaining() <= 10 && this.remaining() > 0
  );

  constructor() {
    addIcons({ timerOutline, refreshOutline, closeOutline, checkmarkCircle });
  }

  start(): void {
    this.open.set(true);
    // Qui, e non alla fine del recupero: questo e' l'unico momento in
    // cui c'e' un tocco dell'utente, e Android sblocca l'audio solo in
    // risposta a un gesto. Creato a timer scaduto, il contesto audio
    // puo' restare sospeso e la sveglia non suonare affatto.
    this.preparaAudio();
    void this.acquisisciWakeLock();
    this.restart();
  }

  restart(): void {
    this.stopInterval();
    this.fermaSveglia();
    this.preparaAudio();
    this.finished.set(false);
    this.remaining.set(this.seconds);
    this.endsAt = Date.now() + this.seconds * 1000;
    this.running.set(true);

    this.intervalId = setInterval(() => {
      const left = Math.round((this.endsAt - Date.now()) / 1000);
      this.remaining.set(Math.max(0, left));
      if (left <= 0) {
        this.complete();
      }
    }, 200);
  }

  private complete(): void {
    this.stopInterval();
    this.running.set(false);
    this.finished.set(true);
    this.avvisa();
  }

  // -------------------------------------------------------------- avviso

  /**
   * Tre canali insieme, perche' in palestra nessuno da solo e' affidabile:
   * il suono si perde nella musica, la vibrazione puo' essere disattivata,
   * il colore richiede di guardare lo schermo.
   */
  private avvisa(): void {
    this.vibra();
    this.suonaSveglia();
  }

  /**
   * Vibrazione allineata ai bip.
   *
   * Dura meno della sveglia: Chrome e la WebView di Android accettano
   * schemi di vibrazione lunghi al massimo 99 valori e scartano il resto.
   * Con 8 valori per gruppo ci stanno 12 gruppi interi, cioe' 12 secondi;
   * il suono prosegue da solo fino alla fine.
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
      // L'ultima pausa del gruppo arriva fino all'inizio del successivo.
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
   * Suoneria generata al momento, senza file audio da scaricare.
   *
   * Un solo oscillatore a onda quadra, il timbro dei cicalini, resta
   * acceso per tutta la durata; i bip sono disegnati sul suo volume.
   * Tutta la sequenza viene programmata subito sull'orologio audio,
   * cosi' il ritmo resta regolare anche se il telefono rallenta il
   * resto dell'app. Per fermarla basta spegnere quell'unico oscillatore.
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

      // Pochi millisecondi di salita e discesa: il bip resta secco, ma
      // senza lo schiocco di un'onda quadra accesa e spenta di colpo.
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
      // Si azzerano i bip gia' programmati e si sfuma in 20 ms: spegnere
      // l'oscillatore a volume pieno produrrebbe uno schiocco.
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

  /**
   * Impedisce che lo schermo si spenga mentre il timer e' aperto.
   * L'API Wake Lock e' supportata dalla WebView di Android e da Chrome;
   * dove manca, il timer funziona comunque.
   */
  private async acquisisciWakeLock(): Promise<void> {
    try {
      // Presente nei tipi standard, ma non in tutti i browser a runtime.
      if (!('wakeLock' in navigator)) return;

      this.wakeLock = await navigator.wakeLock.request('screen');

      // Il sistema puo' revocarlo (chiamata in arrivo, cambio app):
      // in quel caso lo stato va azzerato per poterlo richiedere di nuovo.
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

  // -------------------------------------------------------------- chiusura

  close(): void {
    this.stopInterval();
    this.fermaSveglia();
    this.running.set(false);
    this.open.set(false);
    void this.rilasciaWakeLock();
  }

  private stopInterval(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  ngOnDestroy(): void {
    this.stopInterval();
    this.fermaSveglia();
    void this.rilasciaWakeLock();
    void this.audioCtx?.close();
  }
}
