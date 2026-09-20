import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent, IonHeader, IonTitle, IonToolbar, IonCard, IonCardContent,
  IonCardHeader, IonCardTitle, IonCardSubtitle, IonSpinner, IonIcon,
  IonBadge, IonNote, IonButton, IonRefresher, IonRefresherContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  barbellOutline, calendarOutline, megaphoneOutline, alertCircleOutline,
} from 'ionicons/icons';

import { GymService } from '../../../core/services/gym.service';
import { ClientDashboard } from '../../../core/models/gym.model';

@Component({
  selector: 'app-client-home',
  imports: [
    DatePipe,
    IonContent, IonHeader, IonTitle, IonToolbar, IonCard, IonCardContent,
    IonCardHeader, IonCardTitle, IonCardSubtitle, IonSpinner, IonIcon,
    IonBadge, IonNote, IonButton, IonRefresher, IonRefresherContent,
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.css',
})
export class ClientHomePage implements OnInit {
  private readonly gymService = inject(GymService);
  private readonly router = inject(Router);

  readonly data = signal<ClientDashboard | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    addIcons({ barbellOutline, calendarOutline, megaphoneOutline, alertCircleOutline });
  }

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.errorMessage.set(null);
    try {
      this.data.set(await this.gymService.dashboard());
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

  /** Colore del badge abbonamento in base ai giorni residui. */
  subscriptionColor(daysLeft: number | null): string {
    if (daysLeft === null) return 'medium';
    if (daysLeft < 0) return 'danger';
    if (daysLeft <= 15) return 'warning';
    return 'success';
  }

  subscriptionText(daysLeft: number | null): string {
    if (daysLeft === null) return 'Nessun abbonamento attivo';
    if (daysLeft < 0) return `Scaduto da ${Math.abs(daysLeft)} giorni`;
    if (daysLeft === 0) return 'Scade oggi';
    if (daysLeft === 1) return 'Scade domani';
    return `Ancora ${daysLeft} giorni`;
  }

  openWorkout(): void {
    void this.router.navigate(['/cliente/scheda']);
  }

  openGym(): void {
    void this.router.navigate(['/cliente/palestra']);
  }
}
