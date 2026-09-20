import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonContent, IonHeader, IonTitle, IonToolbar, IonButtons, IonButton, IonIcon,
  IonSegment, IonSegmentButton, IonLabel, IonSpinner, IonList, IonItem,
  IonListHeader, IonRefresher, IonRefresherContent,
  AlertController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  cardOutline, barbellOutline, checkmarkCircleOutline, optionsOutline,
  alertCircleOutline, timeOutline, chevronForwardOutline,
} from 'ionicons/icons';

import { RenewalsService } from '../../../core/services/renewals.service';
import { RenewalItem, RenewalsSummary, RenewalType } from '../../../core/models/renewals.model';

type Filtro = 'all' | RenewalType;

/** Soglia sotto la quale una scadenza futura viene segnalata come urgente. */
const GIORNI_URGENZA = 7;

const FINESTRE_DISPONIBILI = [7, 30, 60, 90] as const;

/**
 * Scadenze: elenco unificato di abbonamenti e schede di allenamento
 * in scadenza o già scaduti.
 *
 * Prima delle due categorie viveva separata: gli abbonamenti nella
 * dashboard, le schede da nessuna parte. Unendole in un solo elenco
 * ordinato per urgenza, l'istruttore ha una sola schermata da
 * controllare invece di doverne dedurre lo stato da più punti diversi.
 */
@Component({
  selector: 'app-renewals',
  imports: [
    IonContent, IonHeader, IonTitle, IonToolbar, IonButtons, IonButton, IonIcon,
    IonSegment, IonSegmentButton, IonLabel, IonSpinner, IonList, IonItem,
    IonListHeader, IonRefresher, IonRefresherContent,
  ],
  templateUrl: './renewals.page.html',
  styleUrl: './renewals.page.css',
})
export class RenewalsPage implements OnInit {
  private readonly renewalsService = inject(RenewalsService);
  private readonly alertController = inject(AlertController);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly items = signal<RenewalItem[]>([]);
  readonly summary = signal<RenewalsSummary | null>(null);

  readonly filtro = signal<Filtro>('all');
  readonly finestraGiorni = signal<number>(30);

  // ngOnInit ha già caricato i dati: al primo ingresso non serve rifarlo.
  private primoIngresso = true;

  constructor() {
    addIcons({
      cardOutline, barbellOutline, checkmarkCircleOutline, optionsOutline,
      alertCircleOutline, timeOutline, chevronForwardOutline,
    });
  }

  ngOnInit(): void {
    void this.load();
  }

  ionViewWillEnter(): void {
    if (this.primoIngresso) {
      this.primoIngresso = false;
      return;
    }
    // Tornando da una scheda cliente l'abbonamento potrebbe essere
    // stato appena rinnovato: senza questo, la voce resterebbe in
    // elenco finché non si ricarica manualmente.
    void this.load();
  }

  async refresh(event: Event): Promise<void> {
    await this.load();
    (event.target as HTMLIonRefresherElement).complete();
  }

  private async load(): Promise<void> {
    this.errorMessage.set(null);
    try {
      const risposta = await this.renewalsService.list(this.finestraGiorni());
      this.items.set(risposta.items);
      this.summary.set(risposta.summary);
    } catch {
      this.errorMessage.set('Impossibile caricare le scadenze.');
    } finally {
      this.loading.set(false);
    }
  }

  // ------------------------------------------------------------- filtro

  readonly elementiFiltrati = computed(() => {
    const f = this.filtro();
    const tutti = this.items();
    return f === 'all' ? tutti : tutti.filter((i) => i.type === f);
  });

  readonly scaduti = computed(() =>
    this.elementiFiltrati().filter((i) => i.daysLeft < 0)
  );

  readonly inScadenza = computed(() =>
    this.elementiFiltrati().filter((i) => i.daysLeft >= 0)
  );

  impostaFiltro(valore: string | number | undefined): void {
    this.filtro.set((valore as Filtro) ?? 'all');
  }

  /** Le due card in alto impostano il filtro anche con un tocco diretto. */
  filtraPer(tipo: RenewalType): void {
    this.filtro.set(tipo);
  }

  totaleUrgente(tipo: RenewalType): number {
    const s = this.summary();
    if (!s) return 0;
    const c = tipo === 'subscription' ? s.subscriptions : s.workouts;
    return c.expired + c.expiring;
  }

  // --------------------------------------------------------- la finestra

  async cambiaFinestra(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Mostra le scadenze entro',
      inputs: FINESTRE_DISPONIBILI.map((giorni) => ({
        name: 'finestra',
        type: 'radio' as const,
        label: `${giorni} giorni`,
        value: giorni,
        checked: giorni === this.finestraGiorni(),
      })),
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Applica',
          handler: (valore: number) => {
            this.finestraGiorni.set(valore);
            void this.load();
          },
        },
      ],
    });
    await alert.present();
  }

  // -------------------------------------------------------- presentazione

  iniziali(nome: string): string {
    const parti = nome.trim().split(/\s+/);
    const prime = parti.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '');
    return prime.join('') || '?';
  }

  /**
   * Livello di urgenza, usato sia per il colore sia per il testo.
   * Sotto zero è già scaduto; sotto la soglia è imminente; il resto
   * è "in arrivo", visibile ma senza allarmare.
   */
  livelloUrgenza(item: RenewalItem): 'scaduto' | 'urgente' | 'in-arrivo' {
    if (item.daysLeft < 0) return 'scaduto';
    if (item.daysLeft <= GIORNI_URGENZA) return 'urgente';
    return 'in-arrivo';
  }

  testoScadenza(item: RenewalItem): string {
    const g = item.daysLeft;
    if (g < 0) return g === -1 ? 'Scaduto ieri' : `Scaduto da ${-g} giorni`;
    if (g === 0) return 'Scade oggi';
    if (g === 1) return 'Scade domani';
    return `Scade fra ${g} giorni`;
  }

  etichettaTipo(tipo: RenewalType): string {
    return tipo === 'subscription' ? 'Abbonamento' : 'Scheda';
  }

  vaiAlCliente(item: RenewalItem): void {
    void this.router.navigate(['/istruttore/clienti', item.clientId]);
  }
}
