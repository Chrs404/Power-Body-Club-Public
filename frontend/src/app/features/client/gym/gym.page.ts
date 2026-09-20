import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  IonContent, IonHeader, IonTitle, IonToolbar, IonSegment, IonSegmentButton,
  IonLabel, IonList, IonItem, IonSpinner, IonNote, IonCard, IonCardContent,
  IonCardHeader, IonCardTitle, IonCardSubtitle, IonRefresher,
  IonRefresherContent, IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { megaphoneOutline, timeOutline } from 'ionicons/icons';

import { GymService } from '../../../core/services/gym.service';
import {
  Closure, DaySchedule, News, WEEK_DAY_LABELS,
} from '../../../core/models/gym.model';

@Component({
  selector: 'app-client-gym',
  imports: [
    DatePipe,
    IonContent, IonHeader, IonTitle, IonToolbar, IonSegment, IonSegmentButton,
    IonLabel, IonList, IonItem, IonSpinner, IonNote, IonCard, IonCardContent,
    IonCardHeader, IonCardTitle, IonCardSubtitle, IonRefresher,
    IonRefresherContent, IonIcon,
  ],
  templateUrl: './gym.page.html',
  styleUrl: './gym.page.css',
})
export class ClientGymPage implements OnInit {
  private readonly gymService = inject(GymService);

  readonly tab = signal<'news' | 'orari'>('news');
  readonly news = signal<News[]>([]);
  readonly schedule = signal<DaySchedule[]>([]);
  readonly closures = signal<Closure[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly dayLabels = WEEK_DAY_LABELS;

  constructor() {
    addIcons({ megaphoneOutline, timeOutline });
  }

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.errorMessage.set(null);
    try {
      const [news, schedule, closures] = await Promise.all([
        this.gymService.news(),
        this.gymService.schedule(),
        this.gymService.closures(),
      ]);
      this.news.set(news);
      this.schedule.set(schedule);
      this.closures.set(closures);
    } catch (error: unknown) {
      const err = error as { error?: { message?: string } };
      this.errorMessage.set(err?.error?.message ?? 'Impossibile caricare i dati.');
    } finally {
      this.loading.set(false);
    }
  }

  async refresh(event: Event): Promise<void> {
    await this.load();
    (event.target as HTMLIonRefresherElement).complete();
  }

  onTabChange(value: string | number | undefined): void {
    this.tab.set((value as 'news' | 'orari') ?? 'news');
  }

  /** Evidenzia il giorno corrente nell'elenco degli orari. */
  isToday(dayOfWeek: string): boolean {
    const order = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    return order[new Date().getDay()] === dayOfWeek;
  }
}
