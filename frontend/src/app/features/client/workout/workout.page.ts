import { Component, DestroyRef, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import {
  IonContent, IonHeader, IonTitle, IonToolbar, IonSpinner, IonIcon,
  IonList, IonItem, IonButton, IonRefresher, IonRefresherContent,
  IonModal, IonButtons, IonInput, AlertController, ToastController,
} from '@ionic/angular/standalone';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  barbellOutline, videocamOutline, timerOutline, refreshOutline,
  checkmarkCircle, checkmark, trendingUpOutline, downloadOutline, chevronDownOutline,
} from 'ionicons/icons';

import { WorkoutService } from '../../../core/services/workout.service';
import { TrainingService } from '../../../core/services/training.service';
import {
  Workout, WorkoutDay, WorkoutExercise, WorkoutBlock, dividiInBlocchi,
  ordinaPerGruppoMuscolare,
} from '../../../core/models/workout.model';
import { MuscleGroup } from '../../../core/models/exercise.model';
import { TrainingSession, LatestWeight } from '../../../core/models/training.model';
import { MuscleGroupPipe } from '../../../shared/pipes/muscle-group.pipe';
import { RestTimerComponent } from '../../../shared/components/rest-timer/rest-timer.component';

@Component({
  selector: 'app-client-workout',
  imports: [
    DatePipe, FormsModule, MuscleGroupPipe, RestTimerComponent,
    IonContent, IonHeader, IonTitle, IonToolbar, IonSpinner, IonIcon,
    IonList, IonItem, IonButton, IonRefresher, IonRefresherContent,
    IonModal, IonButtons, IonInput,
  ],
  templateUrl: './workout.page.html',
  styleUrl: './workout.page.css',
})
export class ClientWorkoutPage implements OnInit, OnDestroy {
  private readonly workoutService = inject(WorkoutService);
  private readonly trainingService = inject(TrainingService);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly workout = signal<Workout | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly selectedDayIndex = signal(0);

  readonly session = signal<TrainingSession | null>(null);
  readonly completedIds = signal<Set<number>>(new Set());
  readonly latestWeights = signal<Map<number, LatestWeight>>(new Map());
  readonly busyExerciseId = signal<number | null>(null);

  /** Blocchi aperti per mostrare descrizione, note e pulsanti (per id del capogruppo). */
  readonly aperti = signal<Set<number>>(new Set());

  /**
   * Pesi delle piramidali scritti oggi, serie per serie, per chiave
   * "esercizio:serie". Ogni campo si salva da solo appena lo si lascia.
   */
  readonly pesiSerie = signal<Map<string, string>>(new Map());
  /** Serie salvate con successo in questa visita, per il segno di conferma. */
  readonly serieSalvate = signal<Set<string>>(new Set());
  readonly serieInSalvataggio = signal<Set<string>>(new Set());

  /** Giorno da aprire chiesto dalla Home con ?giorno=; vince sul calcolo del server. */
  private giornoRichiesto: number | null = null;

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
      checkmarkCircle, checkmark, trendingUpOutline, downloadOutline, chevronDownOutline,
    });
  }

  ngOnInit(): void {
    // Le pagine a schede restano vive: "Inizia allenamento" dalla Home
    // puo' arrivare con la pagina gia' aperta, quindi si ascolta il
    // parametro invece di leggerlo una volta sola.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((parametri) => {
        const valore = parametri.get('giorno');
        if (valore === null) return;
        const indice = Number(valore);
        if (!Number.isInteger(indice) || indice < 0) return;

        this.giornoRichiesto = indice;
        const w = this.workout();
        if (w && indice < w.days.length) this.selectedDayIndex.set(indice);
      });

    void this.load();
  }

  async load(): Promise<void> {
    this.errorMessage.set(null);
    try {
      const { workout, nextDayIndex } = await this.workoutService.getMyActive();
      this.workout.set(workout);

      // Il giorno da aprire: quello chiesto dalla Home, altrimenti il
      // "prossimo allenamento" calcolato dal server (quello iniziato e
      // non finito, o il successivo all'ultimo concluso).
      if (workout) {
        const richiesto = this.giornoRichiesto;
        const indice =
          richiesto !== null && richiesto < workout.days.length ? richiesto : nextDayIndex;
        this.selectedDayIndex.set(Math.min(Math.max(indice, 0), workout.days.length - 1));
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
      this.applicaPesi(weights);
    } catch {
      // Sessione o pesi non disponibili: la scheda resta comunque leggibile.
    }
  }

  private applySession(session: TrainingSession): void {
    this.session.set(session);
    this.completedIds.set(new Set(session.completed.map((c) => c.workoutExerciseId)));
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

  formatWeight(value: string | number | null | undefined): string | null {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    if (Number.isNaN(n)) return null;
    // 60.00 -> "60 kg", 62.50 -> "62,5 kg"
    return `${this.numero(n)} kg`;
  }

  /** Numero all'italiana, senza decimali inutili: 62.5 -> "62,5". */
  numero(n: number): string {
    return parseFloat(n.toFixed(2)).toLocaleString('it-IT');
  }

  // ------------------------------------------------------- blocchi aperti

  aperto(blocco: WorkoutBlock): boolean {
    return this.aperti().has(blocco.capogruppo.id);
  }

  apriChiudi(blocco: WorkoutBlock): void {
    const aperti = new Set(this.aperti());
    const id = blocco.capogruppo.id;
    if (aperti.has(id)) {
      aperti.delete(id);
    } else {
      aperti.add(id);
    }
    this.aperti.set(aperti);
  }

  // ----------------------------------------------------------- piramidali

  piramidale(ex: WorkoutExercise): boolean {
    return ex.kind === 'PYRAMID' && (ex.pyramidSets?.length ?? 0) > 0;
  }

  /** Riga descrittiva sotto il nome dell'esercizio. */
  parametri(ex: WorkoutExercise, superset: boolean): string {
    if (this.piramidale(ex)) {
      const serie = ex.pyramidSets!.length;
      return `${serie} serie · ${ex.reps} · recupero ${this.formatRest(ex.restSeconds)}`;
    }
    const parti = [superset ? `${ex.reps} ripetizioni` : `${ex.sets} × ${ex.reps}`];
    const peso = this.formatWeight(ex.suggestedWeight);
    if (peso) parti.push(peso);
    return parti.join(' · ');
  }

  private chiaveSerie(exerciseId: number, serie: number): string {
    return `${exerciseId}:${serie}`;
  }

  valoreSerie(ex: WorkoutExercise, serie: number): string {
    return this.pesiSerie().get(this.chiaveSerie(ex.exerciseId, serie)) ?? '';
  }

  /**
   * Suggerimento nel campo vuoto: il peso della volta scorsa, o quello
   * consigliato. Se oggi la piramidale e' gia' iniziata, "l'ultima
   * registrazione" e' quella di oggi, incompleta: per le serie non ancora
   * scritte si guarda quella prima.
   */
  segnapostoSerie(ex: WorkoutExercise, serie: number): string {
    const info = this.latestWeights().get(ex.exerciseId);
    const oggi = info?.performedAt.slice(0, 10) === new Date().toISOString().slice(0, 10);
    const riferimento = oggi ? info?.previousSets : info?.lastSets;
    const ultima = riferimento?.find((s) => s.setNumber === serie);
    if (ultima) return this.numero(ultima.weight);
    const consigliato = ex.pyramidSets?.[serie - 1]?.suggestedWeight;
    return consigliato !== null && consigliato !== undefined && consigliato !== ''
      ? this.numero(Number(consigliato))
      : '—';
  }

  statoSerie(ex: WorkoutExercise, serie: number): 'salvataggio' | 'salvata' | null {
    const chiave = this.chiaveSerie(ex.exerciseId, serie);
    if (this.serieInSalvataggio().has(chiave)) return 'salvataggio';
    if (this.serieSalvate().has(chiave)) return 'salvata';
    return null;
  }

  /**
   * Salva il peso di una serie appena si lascia il campo. Riscrivere la
   * stessa serie nello stesso giorno sostituisce il valore precedente.
   */
  async salvaSerie(ex: WorkoutExercise, serie: number, testo: string): Promise<void> {
    const chiave = this.chiaveSerie(ex.exerciseId, serie);
    const pulito = testo.trim().replace(',', '.');
    const valori = new Map(this.pesiSerie());
    valori.set(chiave, testo.trim());
    this.pesiSerie.set(valori);

    if (pulito === '') return;
    const peso = Number(pulito);
    if (Number.isNaN(peso) || peso < 0 || peso > 999) {
      await this.showToast('Peso non valido.', 'warning');
      return;
    }

    this.cambiaInsieme(this.serieInSalvataggio, chiave, true);
    try {
      await this.trainingService.logWeight({ exerciseId: ex.exerciseId, weight: peso, setNumber: serie });
      this.cambiaInsieme(this.serieSalvate, chiave, true);
      this.applicaPesi(await this.trainingService.latestWeights());
    } catch (error: unknown) {
      this.cambiaInsieme(this.serieSalvate, chiave, false);
      const err = error as { error?: { message?: string } };
      await this.showToast(err?.error?.message ?? 'Salvataggio non riuscito.', 'danger');
    } finally {
      this.cambiaInsieme(this.serieInSalvataggio, chiave, false);
    }
  }

  private cambiaInsieme(insieme: typeof this.serieSalvate, chiave: string, presente: boolean): void {
    const nuovo = new Set(insieme());
    if (presente) {
      nuovo.add(chiave);
    } else {
      nuovo.delete(chiave);
    }
    insieme.set(nuovo);
  }

  /**
   * Aggiorna gli ultimi pesi e, per le piramidali registrate oggi,
   * riporta nei campi i valori gia' salvati: riaprendo l'app a meta'
   * allenamento non si riparte da campi vuoti.
   */
  private applicaPesi(pesi: LatestWeight[]): void {
    this.latestWeights.set(new Map(pesi.map((w) => [w.exerciseId, w])));

    const oggi = new Date().toISOString().slice(0, 10);
    const valori = new Map(this.pesiSerie());
    for (const w of pesi) {
      if (!w.lastSets?.length || w.performedAt.slice(0, 10) !== oggi) continue;
      for (const s of w.lastSets) {
        const chiave = this.chiaveSerie(w.exerciseId, s.setNumber);
        if (!valori.get(chiave)) valori.set(chiave, this.numero(s.weight));
      }
    }
    this.pesiSerie.set(valori);
  }

  formatRest(seconds: number): string {
    if (seconds < 60) return `${seconds} s`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
  }

  /** "Petto, tricipiti": i gruppi muscolari del giorno mostrato. */
  get gruppiDelGiorno(): MuscleGroup[] {
    const day = this.currentDay;
    if (!day) return [];
    return [...new Set(day.exercises.map((e) => e.exercise.muscleGroup))];
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
    if (!day) return [];
    // Raccolti per gruppo muscolare prima di dividerli in blocchi: cosi'
    // anche le sigle dei superset (A, B, C) seguono l'ordine mostrato.
    return dividiInBlocchi(
      ordinaPerGruppoMuscolare(day.exercises, (ex) => ex.exercise.muscleGroup)
    );
  }

  /**
   * Gruppo muscolare da mostrare come intestazione sopra il blocco, solo
   * quando inizia una sezione nuova; null per gli altri blocchi.
   */
  sezioneDi(blocchi: WorkoutBlock[], indice: number): MuscleGroup | null {
    const gruppo = blocchi[indice].capogruppo.exercise.muscleGroup;
    const precedente = indice > 0 ? blocchi[indice - 1].capogruppo.exercise.muscleGroup : null;
    return gruppo !== precedente ? gruppo : null;
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
          this.applicaPesi(await this.trainingService.latestWeights());
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
      this.applicaPesi(await this.trainingService.latestWeights());
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
    return delta > 0 ? `+${this.numero(delta)}` : `−${this.numero(-delta)}`;
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
