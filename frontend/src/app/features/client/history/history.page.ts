import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  IonContent, IonHeader, IonTitle, IonToolbar, IonList, IonItem, IonLabel,
  IonSpinner, IonIcon, IonBadge, IonNote, IonModal, IonButtons, IonButton,
  IonRefresher, IonRefresherContent, IonAccordion, IonAccordionGroup,
  IonSegment, IonSegmentButton,
} from '@ionic/angular/standalone';

import {
  PuntoPeso,
  WeightChartComponent,
} from '../../../shared/components/weight-chart/weight-chart.component';
import { addIcons } from 'ionicons';
import { timeOutline, trendingUpOutline, checkmarkDoneOutline } from 'ionicons/icons';

import { WorkoutService } from '../../../core/services/workout.service';
import { TrainingService } from '../../../core/services/training.service';
import { Workout, WorkoutSummary } from '../../../core/models/workout.model';
import { SessionHistoryItem, WeightLog } from '../../../core/models/training.model';

@Component({
  selector: 'app-client-history',
  imports: [
    DatePipe,
    IonContent, IonHeader, IonTitle, IonToolbar, IonList, IonItem, IonLabel,
    IonSpinner, IonIcon, IonBadge, IonNote, IonModal, IonButtons, IonButton,
    IonRefresher, IonRefresherContent, IonAccordion, IonAccordionGroup,
    WeightChartComponent,
    IonSegment, IonSegmentButton,
  ],
  templateUrl: './history.page.html',
  styleUrl: './history.page.css',
})
export class ClientHistoryPage implements OnInit {
  private readonly workoutService = inject(WorkoutService);
  private readonly trainingService = inject(TrainingService);

  readonly tab = signal<'schede' | 'pesi' | 'allenamenti'>('schede');
  readonly workouts = signal<WorkoutSummary[]>([]);
  readonly weightLogs = signal<WeightLog[]>([]);
  readonly sessions = signal<SessionHistoryItem[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly detail = signal<Workout | null>(null);
  readonly detailLoading = signal(false);
  readonly detailOpen = signal(false);

  constructor() {
    addIcons({ timeOutline, trendingUpOutline, checkmarkDoneOutline });
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
      this.weightLogs.set(logs);
      this.sessions.set(sessions);
    } catch (error: unknown) {
      const err = error as { error?: { message?: string } };
      this.errorMessage.set(err?.error?.message ?? 'Impossibile caricare lo storico.');
    } finally {
      this.loading.set(false);
    }
  }

  async refresh(event: Event): Promise<void> {
    await this.load();
    (event.target as HTMLIonRefresherElement).complete();
  }

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

  onTabChange(value: string | number | undefined): void {
    this.tab.set((value as 'schede' | 'pesi' | 'allenamenti') ?? 'schede');
  }

  /** Raggruppa i pesi per esercizio, dal piu' recente. */
  get weightsByExercise(): { name: string; logs: WeightLog[] }[] {
    const map = new Map<number, { name: string; logs: WeightLog[] }>();
    for (const log of this.weightLogs()) {
      const entry = map.get(log.exerciseId) ?? { name: log.exercise.name, logs: [] };
      entry.logs.push(log);
      map.set(log.exerciseId, entry);
    }
    return [...map.values()];
  }

  /**
   * Punti per il grafico di un esercizio.
   *
   * Lo storico arriva dal server in ordine decrescente (i piu' recenti
   * per primi), mentre il grafico ha bisogno dell'ordine cronologico:
   * senza inversione la linea andrebbe letta da destra a sinistra.
   */
  puntiGrafico(logs: WeightLog[]): PuntoPeso[] {
    return [...logs]
      .sort((a, b) => {
        const differenzaData =
          new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime();
        if (differenzaData !== 0) return differenzaData;

        /*
         * A parita' di data si ordina per identificativo.
         *
         * performedAt e' salvato come @db.Date, quindi contiene il giorno
         * ma non l'orario: due registrazioni fatte lo stesso giorno
         * risultano identiche e l'ordine sarebbe arbitrario, con il valore
         * piu' recente che poteva finire in mezzo al grafico.
         *
         * L'identificativo e' autoincrementale, quindi riflette l'ordine
         * in cui i pesi sono stati effettivamente registrati.
         */
        return a.id - b.id;
      })
      .map((l) => ({ data: l.performedAt, peso: Number(l.weight) }));
  }

  sessionDuration(item: SessionHistoryItem): string {
    if (!item.completedAt) return '';
    const ms = new Date(item.completedAt).getTime() - new Date(item.startedAt).getTime();
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}min`;
  }

  formatWeight(value: string | number | null): string | null {
    if (value === null || value === '') return null;
    const n = Number(value);
    return Number.isNaN(n) ? null : `${parseFloat(n.toFixed(2))} kg`;
  }
}
