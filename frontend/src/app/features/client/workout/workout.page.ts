import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  IonContent, IonHeader, IonTitle, IonToolbar, IonSpinner, IonIcon,
  IonSegment, IonSegmentButton, IonLabel, IonList, IonItem, IonNote,
  IonButton, IonRefresher, IonRefresherContent, IonAccordion,
  IonAccordionGroup, IonChip, IonCheckbox, IonModal, IonButtons,
  IonInput, IonProgressBar, AlertController, ToastController,
} from '@ionic/angular/standalone';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  barbellOutline, videocamOutline, timerOutline, refreshOutline,
  checkmarkCircle, ellipseOutline, trendingUpOutline, downloadOutline,
} from 'ionicons/icons';

import { WorkoutService } from '../../../core/services/workout.service';
import { TrainingService } from '../../../core/services/training.service';
import {
  Workout, WorkoutDay, WorkoutExercise, WorkoutBlock, dividiInBlocchi,
} from '../../../core/models/workout.model';
import { TrainingSession, LatestWeight } from '../../../core/models/training.model';
import { MuscleGroupPipe } from '../../../shared/pipes/muscle-group.pipe';
import { RestTimerComponent } from '../../../shared/components/rest-timer/rest-timer.component';

@Component({
  selector: 'app-client-workout',
  imports: [
    DatePipe, FormsModule, MuscleGroupPipe, RestTimerComponent,
    IonContent, IonHeader, IonTitle, IonToolbar, IonSpinner, IonIcon,
    IonSegment, IonSegmentButton, IonLabel, IonList, IonItem, IonNote,
    IonButton, IonRefresher, IonRefresherContent, IonAccordion,
    IonAccordionGroup, IonChip, IonCheckbox, IonModal, IonButtons,
    IonInput, IonProgressBar,
  ],
  templateUrl: './workout.page.html',
  styleUrl: './workout.page.css',
})
export class ClientWorkoutPage implements OnInit, OnDestroy {
  private readonly workoutService = inject(WorkoutService);
  private readonly trainingService = inject(TrainingService);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);

  readonly workout = signal<Workout | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly selectedDayIndex = signal(0);

  readonly session = signal<TrainingSession | null>(null);
  readonly completedIds = signal<Set<number>>(new Set());
  readonly latestWeights = signal<Map<number, LatestWeight>>(new Map());
  readonly busyExerciseId = signal<number | null>(null);

  /**
   * Momento di festeggiamento a giorno completato.
   *
   * Il server chiude la sessione e ne apre una nuova gia' al momento
   * dell'ultima spunta, quindi la risposta contiene un allenamento vuoto.
   * Applicarla subito faceva sparire le spunte all'istante: sembrava un
   * errore, non un traguardo. Qui lo stato completato resta a schermo
   * per qualche secondo, poi l'azzeramento avviene da solo.
   */
  readonly celebrazione = signal(false);
  private timerCelebrazione?: ReturnType<typeof setTimeout>;
  private sessioneDaApplicare: TrainingSession | null = null;

  /** Quanto resta visibile lo stato completato. */
  private static readonly DURATA_CELEBRAZIONE = 4000;

  // Registrazione peso
  readonly weightModalOpen = signal(false);
  readonly weightTarget = signal<WorkoutExercise | null>(null);
  weightValue: number | null = null;
  weightReps: number | null = null;
  weightNotes = '';

  constructor() {
    addIcons({
      barbellOutline, videocamOutline, timerOutline, refreshOutline,
      checkmarkCircle, ellipseOutline, trendingUpOutline, downloadOutline,
    });
  }

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.errorMessage.set(null);
    try {
      const workout = await this.workoutService.getMyActive();
      this.workout.set(workout);

      // Se la scheda ha piu' giorni, propone quello corrispondente
      // al giorno della settimana quando il nome lo suggerisce.
      if (workout) {
        this.selectedDayIndex.set(this.guessTodayIndex(workout.days));
        await this.loadSessionAndWeights();
      }
    } catch (error: unknown) {
      const err = error as { error?: { message?: string } };
      this.errorMessage.set(err?.error?.message ?? 'Impossibile caricare la scheda.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadSessionAndWeights(): Promise<void> {
    try {
      const [session, weights] = await Promise.all([
        this.trainingService.currentSession(),
        this.trainingService.latestWeights(),
      ]);
      this.applySession(session);
      this.latestWeights.set(new Map(weights.map((w) => [w.exerciseId, w])));
    } catch {
      // Sessione o pesi non disponibili: la scheda resta comunque leggibile.
    }
  }

  private applySession(session: TrainingSession): void {
    this.session.set(session);
    this.completedIds.set(new Set(session.completed.map((c) => c.workoutExerciseId)));
  }

  /**
   * Se un giorno si chiama come il giorno corrente ("Lunedì", "lun"),
   * viene selezionato automaticamente. Altrimenti si parte dal primo.
   */
  private guessTodayIndex(days: WorkoutDay[]): number {
    const names = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
    const today = names[new Date().getDay()];
    const short = today.slice(0, 3);

    const index = days.findIndex((d) => {
      const label = d.label.toLowerCase().trim();
      return label === today || label.startsWith(short);
    });

    return index >= 0 ? index : 0;
  }

  async refresh(event: Event): Promise<void> {
    await this.load();
    (event.target as HTMLIonRefresherElement).complete();
  }

  onDayChange(value: string | number | undefined): void {
    this.selectedDayIndex.set(Number(value ?? 0));
  }

  get currentDay(): WorkoutDay | null {
    const w = this.workout();
    if (!w || w.days.length === 0) return null;
    return w.days[this.selectedDayIndex()] ?? w.days[0];
  }

  formatWeight(value: string | number | null): string | null {
    if (value === null || value === '') return null;
    const n = Number(value);
    if (Number.isNaN(n)) return null;
    // 60.00 -> "60", 62.50 -> "62.5"
    return `${parseFloat(n.toFixed(2))} kg`;
  }

  formatRest(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest === 0 ? `${minutes}min` : `${minutes}min ${rest}s`;
  }

  isCompleted(workoutExerciseId: number): boolean {
    return this.completedIds().has(workoutExerciseId);
  }

  /**
   * Blocchi del giorno corrente: esercizi singoli e superset.
   * Il raggruppamento e' ricavato dai collegamenti, non e' un dato salvato.
   */
  get blocchi(): WorkoutBlock[] {
    const day = this.currentDay;
    return day ? dividiInBlocchi(day.exercises) : [];
  }

  /**
   * Un superset e' completato quando lo sono tutti i suoi esercizi.
   * Il server li spunta insieme, quindi in pratica sono sempre allineati:
   * il controllo su tutti i membri e' una difesa contro dati incoerenti.
   */
  bloccoCompletato(blocco: WorkoutBlock): boolean {
    return blocco.esercizi.every((ex) => this.isCompleted(ex.id));
  }

  /**
   * Avanzamento calcolato sui blocchi, non sui singoli esercizi:
   * un superset conta come una voce sola, coerentemente con il fatto
   * che si spunta una volta sola.
   */
  get dayProgress(): number {
    const blocchi = this.blocchi;
    if (blocchi.length === 0) return 0;
    return this.dayCompletedCount / blocchi.length;
  }

  get dayCompletedCount(): number {
    return this.blocchi.filter((b) => this.bloccoCompletato(b)).length;
  }

  get dayTotalCount(): number {
    return this.blocchi.length;
  }

  /**
   * Spunta o toglie la spunta a un blocco intero.
   * Al server viene inviato il solo capogruppo: e' lui a estendere
   * l'operazione a tutti gli esercizi del superset.
   */
  async toggleBlocco(blocco: WorkoutBlock): Promise<void> {
    if (this.busyExerciseId() !== null) return;

    const exercise = blocco.capogruppo;
    const idsDelBlocco = blocco.esercizi.map((e) => e.id);
    const wasCompleted = this.bloccoCompletato(blocco);
    this.busyExerciseId.set(exercise.id);

    // Aggiornamento ottimistico: la spunta reagisce subito,
    // in palestra la rete e' spesso lenta.
    const optimistic = new Set(this.completedIds());
    for (const id of idsDelBlocco) {
      if (wasCompleted) {
        optimistic.delete(id);
      } else {
        optimistic.add(id);
      }
    }
    this.completedIds.set(optimistic);

    try {
      if (wasCompleted) {
        this.applySession(await this.trainingService.unmarkExercise(exercise.id));
      } else {
        const esito = await this.trainingService.markExercise(exercise.id);

        // A giorno completato la sessione nuova viene tenuta da parte
        // e applicata a fine celebrazione, per non azzerare le spunte
        // mentre sono ancora sotto gli occhi.
        if (!esito.giornoCompletato) {
          this.applySession(esito.session);
        }

        if (esito.giornoCompletato) {
          this.avviaCelebrazione(esito.session);
          const pesi = await this.trainingService.latestWeights();
          this.latestWeights.set(new Map(pesi.map((w) => [w.exerciseId, w])));
        }
      }
    } catch {
      // Ripristina lo stato reale se il salvataggio fallisce.
      const rollback = new Set(this.completedIds());
      for (const id of idsDelBlocco) {
        if (wasCompleted) {
          rollback.add(id);
        } else {
          rollback.delete(id);
        }
      }
      this.completedIds.set(rollback);
      await this.showToast('Salvataggio non riuscito. Riprova.', 'danger');
    } finally {
      this.busyExerciseId.set(null);
    }
  }

  private avviaCelebrazione(sessioneNuova: TrainingSession): void {
    this.sessioneDaApplicare = sessioneNuova;
    this.celebrazione.set(true);
    this.vibra();

    this.timerCelebrazione = setTimeout(
      () => this.chiudiCelebrazione(),
      ClientWorkoutPage.DURATA_CELEBRAZIONE
    );
  }

  /** Applica la sessione nuova e torna alla scheda pronta per la volta dopo. */
  chiudiCelebrazione(): void {
    clearTimeout(this.timerCelebrazione);
    this.timerCelebrazione = undefined;

    if (this.sessioneDaApplicare) {
      this.applySession(this.sessioneDaApplicare);
      this.sessioneDaApplicare = null;
    }
    this.celebrazione.set(false);
  }

  private vibra(): void {
    try {
      if ('vibrate' in navigator) {
        navigator.vibrate([120, 70, 120, 70, 260]);
      }
    } catch {
      // Non supportata o negata: resta il segnale visivo.
    }
  }

  ngOnDestroy(): void {
    // Uscendo dalla pagina durante la celebrazione il timer resterebbe
    // attivo e scriverebbe su un componente ormai distrutto.
    clearTimeout(this.timerCelebrazione);
  }

  async confirmReset(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Nuovo allenamento?',
      message:
        'Le spunte verranno azzerate. L\'allenamento appena svolto resta nello storico.',
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        { text: 'Ricomincia', role: 'confirm', handler: () => void this.reset() },
      ],
    });
    await alert.present();
  }

  private async reset(): Promise<void> {
    try {
      const result = await this.trainingService.resetSession();
      this.applySession(result.session);
      await this.showToast(result.message, 'success');
    } catch {
      await this.showToast('Operazione non riuscita.', 'danger');
    }
  }

  openWeightModal(exercise: WorkoutExercise): void {
    this.weightTarget.set(exercise);
    const last = this.latestWeights().get(exercise.exerciseId);
    // Precompila con l'ultimo peso usato, o con quello consigliato.
    this.weightValue =
      last?.lastWeight ??
      (exercise.suggestedWeight !== null ? Number(exercise.suggestedWeight) : null);
    this.weightReps = null;
    this.weightNotes = '';
    this.weightModalOpen.set(true);
  }

  async saveWeight(): Promise<void> {
    const target = this.weightTarget();
    if (!target || this.weightValue === null || this.weightValue < 0) {
      await this.showToast('Inserisci un peso valido.', 'warning');
      return;
    }

    try {
      await this.trainingService.logWeight({
        exerciseId: target.exerciseId,
        weight: this.weightValue,
        reps: this.weightReps ?? null,
        notes: this.weightNotes.trim() || undefined,
      });
      this.weightModalOpen.set(false);
      const weights = await this.trainingService.latestWeights();
      this.latestWeights.set(new Map(weights.map((w) => [w.exerciseId, w])));
      await this.showToast('Peso registrato.', 'success');
    } catch (error: unknown) {
      const err = error as { error?: { message?: string } };
      await this.showToast(err?.error?.message ?? 'Salvataggio non riuscito.', 'danger');
    }
  }

  weightInfo(exerciseId: number): LatestWeight | null {
    return this.latestWeights().get(exerciseId) ?? null;
  }

  formatDelta(delta: number | null): string | null {
    if (delta === null || delta === 0) return null;
    return delta > 0 ? `+${delta}` : String(delta);
  }

  private async showToast(message: string, color: string): Promise<void> {
    const toast = await this.toastController.create({
      message, duration: 2200, color, position: 'bottom',
    });
    await toast.present();
  }

  readonly scaricando = signal(false);

  /**
   * Scarica la scheda in PDF.
   *
   * Utile a chi preferisce il foglio stampato per segnare i carichi
   * a mano durante l'allenamento, come si faceva col protocollo cartaceo.
   */
  async scaricaPdf(): Promise<void> {
    const w = this.workout();
    if (!w || this.scaricando()) return;

    this.scaricando.set(true);
    const data = w.startDate.slice(0, 10).split('-').reverse().join('-');
    const nome = w.name.replace(/[^a-zA-Z0-9]/g, '_');

    try {
      await this.workoutService.downloadPdf(w.id, `${nome}_${data}.pdf`);
    } catch {
      await this.showToast('Impossibile generare il PDF.', 'danger');
    } finally {
      this.scaricando.set(false);
    }
  }

  openVideo(url: string): void {
    window.open(url, '_blank', 'noopener');
  }
}
