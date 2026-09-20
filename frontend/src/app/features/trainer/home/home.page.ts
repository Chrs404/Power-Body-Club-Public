import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonContent, IonHeader, IonTitle, IonToolbar,
  IonCard, IonCardContent, IonIcon, IonSpinner,
  IonRefresher, IonRefresherContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  peopleOutline, barbellOutline, megaphoneOutline, timeOutline,
  personAddOutline, alertCircleOutline, layersOutline, calendarOutline,
} from 'ionicons/icons';

import { AuthService } from '../../../core/services/auth.service';
import { ClientService } from '../../../core/services/client.service';
import { RenewalsService } from '../../../core/services/renewals.service';
import { ClientsSummary } from '../../../core/models/client.model';
import { RenewalsSummary } from '../../../core/models/renewals.model';

@Component({
  selector: 'app-trainer-home',
  imports: [
    RouterLink,
    IonContent, IonHeader, IonTitle, IonToolbar,
    IonCard, IonCardContent, IonIcon, IonSpinner,
    IonRefresher, IonRefresherContent,
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.css',
})
export class TrainerHomePage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly clientService = inject(ClientService);
  private readonly renewalsService = inject(RenewalsService);

  readonly user = this.auth.user;
  readonly summary = signal<ClientsSummary | null>(null);
  readonly renewals = signal<RenewalsSummary | null>(null);
  readonly loading = signal(true);

  constructor() {
    addIcons({
      peopleOutline, barbellOutline, megaphoneOutline, timeOutline,
      personAddOutline, alertCircleOutline, layersOutline, calendarOutline,
    });
  }

  /** Trascinamento verso il basso per aggiornare i dati. */
  async refresh(event: Event): Promise<void> {
    await this.loadAll();
    (event.target as HTMLIonRefresherElement).complete();
  }

  ngOnInit(): void {
    void this.loadAll();
  }

  /**
   * Abbonamenti e schede in scadenza vengono da un solo endpoint
   * (/renewals), separato dal riepilogo dei clienti: sono due concetti
   * diversi — quanti clienti ha la palestra, contro cosa scade a breve —
   * e tenerli distinti evita che l'uno freni l'altro se dovesse fallire.
   */
  private async loadAll(): Promise<void> {
    const [clienti, scadenze] = await Promise.allSettled([
      this.clientService.summary(),
      this.renewalsService.list(30),
    ]);

    if (clienti.status === 'fulfilled') {
      this.summary.set(clienti.value);
    }
    if (scadenze.status === 'fulfilled') {
      this.renewals.set(scadenze.value.summary);
    }

    this.loading.set(false);
  }

  /** Totale di voci che richiedono attenzione, scadute o in scadenza. */
  get totaleScadenze(): number {
    const r = this.renewals();
    if (!r) return 0;
    return (
      r.subscriptions.expired + r.subscriptions.expiring +
      r.workouts.expired + r.workouts.expiring
    );
  }

  get totaleScaduti(): number {
    const r = this.renewals();
    return r ? r.subscriptions.expired + r.workouts.expired : 0;
  }
}
