import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  IonContent, IonHeader, IonToolbar, IonSpinner, IonIcon,
  IonRefresher, IonRefresherContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { barbellOutline, alertCircleOutline } from 'ionicons/icons';

import { GymService } from '../../../core/services/gym.service';
import { AuthService } from '../../../core/services/auth.service';
import { ClientDashboard } from '../../../core/models/gym.model';
import { MuscleGroup, MUSCLE_GROUP_LABELS } from '../../../core/models/exercise.model';

type Tono = 'ok' | 'warn' | 'bad' | '';

/**
 * Oggi: la home del cliente risponde a una domanda sola, "cosa faccio
 * oggi?". In cima il prossimo allenamento con il pulsante per iniziarlo,
 * sotto abbonamento, scheda e comunicazioni della palestra.
 */
@Component({
  selector: 'app-client-home',
  imports: [
    DatePipe, RouterLink,
    IonContent, IonHeader, IonToolbar, IonSpinner, IonIcon,
    IonRefresher, IonRefresherContent,
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.css',
})
export class ClientHomePage implements OnInit {
  private readonly gymService = inject(GymService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly data = signal<ClientDashboard | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  /** "domenica 15 novembre", nel fuso del telefono. */
  readonly oggi = new Date().toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  /** Iniziale del nome nel tondo del profilo, come nel resto dell'app. */
  readonly iniziali = computed(() => {
    const u = this.auth.user();
    return (u?.firstName?.[0] || u?.username?.[0] || '?').toUpperCase();
  });

  readonly nome = computed(
    () => this.data()?.user.firstName || this.auth.user()?.firstName || ''
  );

  constructor() {
    addIcons({ barbellOutline, alertCircleOutline });
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

  /** "Petto e tricipiti": i gruppi muscolari del giorno, in italiano. */
  gruppi(codici: string[]): string {
    const nomi = codici.map((c) => MUSCLE_GROUP_LABELS[c as MuscleGroup] ?? c);
    if (nomi.length <= 1) return nomi.join('');
    return `${nomi.slice(0, -1).join(', ')} e ${nomi[nomi.length - 1]}`.toLowerCase()
      .replace(/^./, (l) => l.toUpperCase());
  }

  iniziaAllenamento(): void {
    const giorno = this.data()?.nextDay?.index ?? 0;
    void this.router.navigate(['/cliente/scheda'], { queryParams: { giorno } });
  }

  /** Giorni che mancano a una data "YYYY-MM-DD"; negativo se passata. */
  giorniA(data: string | null | undefined): number | null {
    if (!data) return null;
    const fine = Date.UTC(+data.slice(0, 4), +data.slice(5, 7) - 1, +data.slice(8, 10));
    const ora = new Date();
    const oggi = Date.UTC(ora.getFullYear(), ora.getMonth(), ora.getDate());
    return Math.round((fine - oggi) / 86_400_000);
  }

  tono(giorni: number | null): Tono {
    if (giorni === null) return '';
    if (giorni < 0) return 'bad';
    if (giorni <= 7) return 'warn';
    return 'ok';
  }

  scadenza(giorni: number | null, femminile = false): string {
    if (giorni === null) return 'Nessuna scadenza';
    if (giorni < 0) {
      return `Scadut${femminile ? 'a' : 'o'} da ${-giorni} ${-giorni === 1 ? 'giorno' : 'giorni'}`;
    }
    if (giorni === 0) return 'Scade oggi';
    if (giorni === 1) return 'Scade domani';
    return `${giorni} giorni`;
  }
}
