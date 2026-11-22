import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent, IonHeader, IonTitle, IonToolbar, IonSpinner, IonIcon,
  IonModal, IonButtons, IonButton, IonRefresher, IonRefresherContent,
  AlertController, ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  timeOutline, trendingUpOutline, checkmarkDoneOutline, createOutline, trashOutline,
  chevronForwardOutline,
} from 'ionicons/icons';

import {
  PuntoPeso,
  WeightChartComponent,
} from '../../../shared/components/weight-chart/weight-chart.component';
import { WorkoutService } from '../../../core/services/workout.service';
import { TrainingService } from '../../../core/services/training.service';
import {
  Workout, WorkoutSummary, WorkoutDay, WorkoutExercise, ordinaPerGruppoMuscolare,
} from '../../../core/models/workout.model';
import { MuscleGroup } from '../../../core/models/exercise.model';
import { MuscleGroupPipe } from '../../../shared/pipes/muscle-group.pipe';
import { SessionHistoryItem, WeightLog } from '../../../core/models/training.model';

type Sezione = 'esercizi' | 'allenamenti' | 'schede';

/**
 * Una registrazione come la vede il cliente: un peso, oppure tutte le
 * serie di una piramidale fatte lo stesso giorno.
 */
interface Registrazione {
  chiave: string;
  data: string;
  piramide: boolean;
  /** Righe del database; per la piramidale in ordine di serie. */
  righe: WeightLog[];
  massimo: number;
}

/**
 * Progressi: l'andamento dei pesi esercizio per esercizio, con la
 * possibilita' di correggere o eliminare ogni registrazione; poi gli
 * allenamenti conclusi e le schede passate.
 */
@Component({
  selector: 'app-client-history',
  imports: [
    DatePipe, FormsModule, MuscleGroupPipe, WeightChartComponent,
    IonContent, IonHeader, IonTitle, IonToolbar, IonSpinner, IonIcon,
    IonModal, IonButtons, IonButton, IonRefresher, IonRefresherContent,
  ],
  templateUrl: './history.page.html',
  styleUrl: './history.page.css',
})
export class ClientHistoryPage implements OnInit {
  private readonly workoutService = inject(WorkoutService);
  private readonly trainingService = inject(TrainingService);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);

  readonly sezione = signal<Sezione>('esercizi');
  readonly workouts = signal<WorkoutSummary[]>([]);
  readonly weightLogs = signal<WeightLog[]>([]);
  readonly sessions = signal<SessionHistoryItem[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly detail = signal<Workout | null>(null);
  readonly detailLoading = signal(false);
  readonly detailOpen = signal(false);

  /** Esercizio mostrato nel grafico. */
  readonly esercizioScelto = signal<number | null>(null);

  // Modifica di una registrazione
  readonly inModifica = signal<string | null>(null);
  readonly salvando = signal(false);
  modificaData = '';
  modificaRip: number | null = null;
  /** Peso per id di riga: una voce per un peso normale, una per serie nella piramidale. */
  modificaPesi: Record<number, string> = {};

  /** Esercizi con almeno una registrazione, in ordine alfabetico. */
  readonly esercizi = computed(() => {
    const visti = new Map<number, string>();
    for (const log of this.weightLogs()) visti.set(log.exerciseId, log.exercise.name);
    return [...visti.entries()]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  });

  /** Registrazioni dell'esercizio scelto, dalla piu' recente. */
  readonly registrazioni = computed<Registrazione[]>(() => {
    const id = this.esercizioScelto();
    const gruppi = new Map<string, Registrazione>();

    for (const log of this.weightLogs()) {
      if (log.exerciseId !== id) continue;
      const giorno = log.performedAt.slice(0, 10);
      const chiave = log.setNumber === null ? `riga:${log.id}` : `piramide:${giorno}`;

      const r = gruppi.get(chiave) ?? {
        chiave, data: log.performedAt, piramide: log.setNumber !== null, righe: [], massimo: 0,
      };
      r.righe.push(log);
      r.massimo = Math.max(r.massimo, Number(log.weight));
      gruppi.set(chiave, r);
    }

    const elenco = [...gruppi.values()];
    for (const r of elenco) r.righe.sort((a, b) => (a.setNumber ?? 0) - (b.setNumber ?? 0));
    // Dal server arrivano gia' dalla piu' recente: a parita' di giorno vince l'ultima inserita.
    return elenco.sort((a, b) =>
      b.data.localeCompare(a.data) || Math.max(...b.righe.map((x) => x.id)) - Math.max(...a.righe.map((x) => x.id))
    );
  });

  /** Punti del grafico in ordine cronologico: per la piramidale, la serie piu' pesante. */
  readonly punti = computed<PuntoPeso[]>(() =>
    [...this.registrazioni()].reverse().map((r) => ({ data: r.data, peso: r.massimo }))
  );

  readonly variazione = computed(() => {
    const [ultima, precedente] = this.registrazioni();
    if (!ultima || !precedente) return null;
    return Math.round((ultima.massimo - precedente.massimo) * 100) / 100;
  });

  constructor() {
    addIcons({
      timeOutline, trendingUpOutline, checkmarkDoneOutline, createOutline, trashOutline,
      chevronForwardOutline,
    });
  }

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.errorMessage.set(null);
    try {
      const [workouts, logs, sessions] = await Promise.all([
        this.workoutService.getMyWorkouts(),
        this.trainingService.weightHistory(),
        this.trainingService.sessionHistory(),
      ]);
      this.workouts.set(workouts);
      this.sessions.set(sessions);
      this.applicaPesi(logs);
    } catch (error: unknown) {
      const err = error as { error?: { message?: string } };
      this.errorMessage.set(err?.error?.message ?? 'Impossibile caricare i progressi.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Aggiorna lo storico mantenendo l'esercizio scelto, se esiste ancora. */
  private applicaPesi(logs: WeightLog[]): void {
    this.weightLogs.set(logs);
    const scelto = this.esercizioScelto();
    if (scelto === null || !logs.some((l) => l.exerciseId === scelto)) {
      // Il piu' recente: lo storico arriva gia' ordinato dal piu' recente.
      this.esercizioScelto.set(logs[0]?.exerciseId ?? null);
    }
  }

  async refresh(event: Event): Promise<void> {
    await this.load();
    (event.target as HTMLIonRefresherElement).complete();
  }

  scegliEsercizio(valore: string): void {
    this.inModifica.set(null);
    this.esercizioScelto.set(Number(valore));
  }

  // ---------------------------------------------------------- registrazioni

  numero(n: number | string): string {
    return parseFloat(Number(n).toFixed(2)).toLocaleString('it-IT');
  }

  /** "24 · 26 · 28 · 30 kg" oppure "62,5 kg × 8". */
  valore(r: Registrazione): string {
    if (r.piramide) return `${r.righe.map((x) => this.numero(x.weight)).join(' · ')} kg`;
    const riga = r.righe[0];
    return `${this.numero(riga.weight)} kg${riga.reps ? ' × ' + riga.reps : ''}`;
  }

  dettaglio(r: Registrazione): string {
    if (r.piramide) {
      const rip = r.righe.map((x) => x.reps).filter((x) => x !== null);
      return `Piramidale, ${r.righe.length} serie${rip.length === r.righe.length ? ' · ' + rip.join('-') : ''}`;
    }
    return r.righe[0].notes ?? '';
  }

  apriModifica(r: Registrazione): void {
    this.modificaData = r.data.slice(0, 10);
    this.modificaRip = r.piramide ? null : r.righe[0].reps;
    this.modificaPesi = Object.fromEntries(r.righe.map((x) => [x.id, this.numero(x.weight)]));
    this.inModifica.set(r.chiave);
  }

  annullaModifica(): void {
    this.inModifica.set(null);
  }

  async salvaModifica(r: Registrazione): Promise<void> {
    if (this.salvando()) return;

    const modifiche: { id: number; dati: { weight?: number; reps?: number | null; performedAt?: string } }[] = [];
    for (const riga of r.righe) {
      const testo = String(this.modificaPesi[riga.id] ?? '').trim().replace(',', '.');
      const peso = Number(testo);
      if (testo === '' || Number.isNaN(peso) || peso < 0 || peso > 999) {
        await this.avviso('Controlla i pesi: devono essere numeri fra 0 e 999.', 'warning');
        return;
      }

      const dati: { weight?: number; reps?: number | null; performedAt?: string } = {};
      if (peso !== Number(riga.weight)) dati.weight = peso;
      if (this.modificaData && this.modificaData !== riga.performedAt.slice(0, 10)) {
        dati.performedAt = this.modificaData;
      }
      if (!r.piramide) {
        const rip = this.modificaRip ? Math.round(this.modificaRip) : null;
        if (rip !== riga.reps) dati.reps = rip;
      }
      if (Object.keys(dati).length > 0) modifiche.push({ id: riga.id, dati });
    }

    if (modifiche.length === 0) {
      this.inModifica.set(null);
      return;
    }

    this.salvando.set(true);
    try {
      for (const m of modifiche) await this.trainingService.updateWeightLog(m.id, m.dati);
      this.inModifica.set(null);
      this.applicaPesi(await this.trainingService.weightHistory());
      await this.avviso('Registrazione aggiornata.', 'success');
    } catch (error: unknown) {
      const err = error as { error?: { message?: string } };
      await this.avviso(err?.error?.message ?? 'Salvataggio non riuscito.', 'danger');
      this.applicaPesi(await this.trainingService.weightHistory().catch(() => this.weightLogs()));
    } finally {
      this.salvando.set(false);
    }
  }

  async confermaElimina(r: Registrazione): Promise<void> {
    const data = new Date(r.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', timeZone: 'UTC' });
    const alert = await this.alertController.create({
      header: 'Eliminare la registrazione?',
      message: r.piramide
        ? `Verranno eliminate tutte le ${r.righe.length} serie del ${data}.`
        : `${this.valore(r)} del ${data}.`,
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        { text: 'Elimina', role: 'destructive', handler: () => void this.elimina(r) },
      ],
    });
    await alert.present();
  }

  private async elimina(r: Registrazione): Promise<void> {
    try {
      await this.trainingService.deleteWeightLog(r.righe[0].id, r.piramide);
      if (this.inModifica() === r.chiave) this.inModifica.set(null);
      this.applicaPesi(await this.trainingService.weightHistory());
      await this.avviso('Registrazione eliminata.', 'success');
    } catch {
      await this.avviso('Eliminazione non riuscita.', 'danger');
    }
  }

  private async avviso(message: string, color: string): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 2200, color, position: 'bottom' });
    await toast.present();
  }

  // ------------------------------------------------------ allenamenti e schede

  async openDetail(workout: WorkoutSummary): Promise<void> {
    this.detailOpen.set(true);
    this.detailLoading.set(true);
    this.detail.set(null);
    try {
      this.detail.set(await this.workoutService.getById(workout.id));
    } catch {
      this.detailOpen.set(false);
    } finally {
      this.detailLoading.set(false);
    }
  }

  sessionDuration(item: SessionHistoryItem): string {
    if (!item.completedAt) return '';
    const ms = new Date(item.completedAt).getTime() - new Date(item.startedAt).getTime();
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
  }

  /** Esercizi del giorno raccolti per gruppo muscolare, come nella pagina Scheda. */
  eserciziPerGruppo(day: WorkoutDay): WorkoutExercise[] {
    return ordinaPerGruppoMuscolare(day.exercises, (ex) => ex.exercise.muscleGroup);
  }

  /** Gruppo da mostrare come intestazione, solo dove inizia una sezione nuova. */
  sezioneDi(esercizi: WorkoutExercise[], indice: number): MuscleGroup | null {
    const gruppo = esercizi[indice].exercise.muscleGroup;
    return indice === 0 || esercizi[indice - 1].exercise.muscleGroup !== gruppo ? gruppo : null;
  }

  /** Serie e ripetizioni di un esercizio di una scheda passata. */
  descriviEsercizio(ex: WorkoutExercise): string {
    if (ex.kind === 'PYRAMID') return `Piramidale ${ex.reps}`;
    const peso = ex.suggestedWeight !== null && ex.suggestedWeight !== ''
      ? ` · ${this.numero(ex.suggestedWeight)} kg` : '';
    return `${ex.sets} × ${ex.reps}${peso}`;
  }
}
