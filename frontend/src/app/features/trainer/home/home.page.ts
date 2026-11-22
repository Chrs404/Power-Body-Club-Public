import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonContent, IonHeader, IonToolbar, IonIcon, IonSpinner,
  IonRefresher, IonRefresherContent, ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, layersOutline, timeOutline } from 'ionicons/icons';

import { AuthService } from '../../../core/services/auth.service';
import { ClientService } from '../../../core/services/client.service';
import { RenewalsService } from '../../../core/services/renewals.service';
import { DeletionItem, RenewalItem } from '../../../core/models/renewals.model';

/** Una scadenza futura entro questa soglia e' "in scadenza". */
const GIORNI_URGENZA = 7;

/**
 * Home dell'istruttore: un saluto e le cose da fare oggi.
 *
 * In cima tre numeri (scaduti, in scadenza, in eliminazione), sotto le
 * scadenze piu' urgenti con l'azione per risolverle e i clienti che
 * l'eliminazione automatica sta per rimuovere, con "Rimanda".
 */
@Component({
  selector: 'app-trainer-home',
  imports: [
    RouterLink,
    IonContent, IonHeader, IonToolbar, IonIcon, IonSpinner,
    IonRefresher, IonRefresherContent,
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.css',
})
export class TrainerHomePage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly clientService = inject(ClientService);
  private readonly renewalsService = inject(RenewalsService);
  private readonly router = inject(Router);
  private readonly toastController = inject(ToastController);

  readonly user = this.auth.user;
  readonly items = signal<RenewalItem[]>([]);
  readonly eliminazioni = signal<DeletionItem[]>([]);
  readonly loading = signal(true);
  readonly errore = signal(false);
  readonly rimandando = signal<number | null>(null);

  readonly oggi = new Date().toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  /** Iniziale del nome nel tondo del profilo, come nel resto dell'app. */
  readonly iniziali = computed(() => {
    const u = this.user();
    return (u?.firstName?.[0] || u?.username?.[0] || '?').toUpperCase();
  });

  /** Clienti con almeno una scadenza passata. */
  readonly scaduti = computed(
    () => new Set(this.items().filter((i) => i.daysLeft !== null && i.daysLeft < 0).map((i) => i.clientId)).size
  );

  /** Clienti con una scadenza entro 7 giorni (e nulla di gia' scaduto). */
  readonly inScadenza = computed(() => {
    const scaduti = new Set(
      this.items().filter((i) => i.daysLeft !== null && i.daysLeft < 0).map((i) => i.clientId)
    );
    return new Set(
      this.items()
        .filter((i) => i.daysLeft !== null && i.daysLeft >= 0 && i.daysLeft <= GIORNI_URGENZA)
        .map((i) => i.clientId)
        .filter((id) => !scaduti.has(id))
    ).size;
  });

  /**
   * Le scadenze da gestire, dalla piu' urgente: gia' scadute o entro una
   * settimana. Chi e' in eliminazione ha la sua sezione e qui non compare.
   */
  readonly daFare = computed(() => {
    const inEliminazione = new Set(this.eliminazioni().map((e) => e.clientId));
    return this.items()
      .filter((i) => i.daysLeft !== null && i.daysLeft <= GIORNI_URGENZA && !inEliminazione.has(i.clientId))
      .slice(0, 5);
  });

  constructor() {
    addIcons({ addOutline, layersOutline, timeOutline });
  }

  ngOnInit(): void {
    void this.load();
  }

  /** Tornando dal dettaglio di un cliente un rinnovo potrebbe essere appena avvenuto. */
  ionViewWillEnter(): void {
    if (!this.loading()) void this.load();
  }

  async refresh(event: Event): Promise<void> {
    await this.load();
    (event.target as HTMLIonRefresherElement).complete();
  }

  private async load(): Promise<void> {
    try {
      const risposta = await this.renewalsService.list();
      this.items.set(risposta.items);
      this.eliminazioni.set(risposta.deletions ?? []);
      this.errore.set(false);
    } catch {
      this.errore.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  // ------------------------------------------------------------- testi

  stato(item: RenewalItem): string {
    const cosa = item.type === 'subscription' ? 'Abbonamento' : 'Scheda';
    const g = item.daysLeft ?? 0;
    if (g < 0) return `${cosa} scadut${item.type === 'subscription' ? 'o' : 'a'} da ${-g} ${-g === 1 ? 'giorno' : 'giorni'}`;
    if (g === 0) return `${cosa} in scadenza oggi`;
    if (g === 1) return `${cosa} in scadenza domani`;
    return `${cosa} in scadenza fra ${g} giorni`;
  }

  tono(item: RenewalItem): 'bad' | 'warn' {
    return item.daysLeft !== null && item.daysLeft < 0 ? 'bad' : 'warn';
  }

  quando(e: DeletionItem): string {
    if (e.daysLeft <= 0) return 'a breve';
    if (e.daysLeft === 1) return 'domani';
    return `fra ${e.daysLeft} giorni`;
  }

  motivo(e: DeletionItem): string {
    if (!e.subscriptionEnd && !e.workoutEnd) return 'Mai avuto abbonamento né scheda.';
    return 'Abbonamento e scheda scaduti.';
  }

  iniziale(nome: string): string {
    return (nome.trim()[0] ?? '?').toUpperCase();
  }

  // ------------------------------------------------------------- azioni

  apriCliente(clientId: number): void {
    void this.router.navigate(['/istruttore/clienti', clientId]);
  }

  /** Abbonamento: si rinnova dal dettaglio. Scheda: si crea direttamente la nuova. */
  azione(item: RenewalItem): void {
    if (item.type === 'workout') {
      void this.router.navigate(['/istruttore/schede/nuova', item.clientId]);
    } else {
      void this.router.navigate(['/istruttore/clienti', item.clientId], { queryParams: { rinnova: 1 } });
    }
  }

  async rimanda(e: DeletionItem): Promise<void> {
    if (this.rimandando() !== null) return;
    this.rimandando.set(e.clientId);
    try {
      await this.clientService.postponeDeletion(e.clientId);
      await this.load();
      await this.avviso(`Eliminazione di ${e.clientName} rimandata di 15 giorni.`, 'success');
    } catch {
      await this.avviso('Operazione non riuscita.', 'danger');
    } finally {
      this.rimandando.set(null);
    }
  }

  private async avviso(message: string, color: string): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 2500, color, position: 'bottom' });
    await toast.present();
  }
}
