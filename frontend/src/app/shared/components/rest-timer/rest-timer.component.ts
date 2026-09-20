import {
  Component, Input, signal, computed, OnDestroy,
} from '@angular/core';
import { IonButton, IonIcon, IonModal, IonContent } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  timerOutline, refreshOutline, closeOutline, checkmarkCircle,
} from 'ionicons/icons';

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
    void this.acquisisciWakeLock();
    this.restart();
  }

  restart(): void {
    this.stopInterval();
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
    this.suona();
  }

  private vibra(): void {
    try {
      if ('vibrate' in navigator) {
        navigator.vibrate([180, 90, 180, 90, 320]);
      }
    } catch {
      // Non supportata o negata: restano suono e segnale visivo.
    }
  }

  /**
   * Suono generato al momento, senza file audio da scaricare.
   * Due note brevi, abbastanza acute da emergere sul rumore di fondo.
   */
  private suona(): void {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) return;

      this.audioCtx ??= new Ctx();
      const ctx = this.audioCtx;
      if (ctx.state === 'suspended') void ctx.resume();

      [0, 0.22].forEach((ritardo, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = i === 0 ? 880 : 1180;

        const inizio = ctx.currentTime + ritardo;
        gain.gain.setValueAtTime(0, inizio);
        gain.gain.linearRampToValueAtTime(0.32, inizio + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, inizio + 0.19);

        osc.connect(gain).connect(ctx.destination);
        osc.start(inizio);
        osc.stop(inizio + 0.2);
      });
    } catch {
      // Audio non disponibile: restano vibrazione e segnale visivo.
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
    void this.rilasciaWakeLock();
    void this.audioCtx?.close();
  }
}
