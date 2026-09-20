import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  IonContent, IonHeader, IonTitle, IonToolbar, IonSearchbar,
  IonSegment, IonSegmentButton, IonLabel, IonSpinner, IonList, IonItem,
  IonListHeader, IonIcon, IonFab, IonFabButton, IonRefresher, IonRefresherContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  add, cardOutline, barbellOutline, checkmarkCircleOutline,
  alertCircleOutline, timeOutline, chevronForwardOutline,
} from 'ionicons/icons';

import { RenewalsService } from '../../../../core/services/renewals.service';
import { RenewalItem, RenewalType } from '../../../../core/models/renewals.model';

type Filtro = RenewalType;

/** Soglia sotto la quale una scadenza futura viene segnalata come urgente. */
const GIORNI_URGENZA = 7;

/**
 * Clienti: lo stato di ogni cliente su abbonamento e scheda, in un
 * solo elenco.
 *
 * Prima questa pagina mostrava solo gli abbonamenti, filtrati per
 * chi era in scadenza entro una finestra fissa. Le schede di
 * allenamento non comparivano da nessuna parte come avviso — bisognava
 * aprire ogni cliente per scoprire se la sua era vicina alla fine.
 *
 * Qui non c'e' alcuna finestra temporale: ogni cliente con un
 * abbonamento o una scheda e' visibile, ordinato per urgenza, cosi'
 * la vista resta completa invece di nascondere chi e' semplicemente
 * in regola.
 */
@Component({
  selector: 'app-client-list',
  imports: [
    FormsModule, RouterLink,
    IonContent, IonHeader, IonTitle, IonToolbar, IonSearchbar,
    IonSegment, IonSegmentButton, IonLabel, IonSpinner, IonList, IonItem,
    IonListHeader, IonIcon, IonFab, IonFabButton, IonRefresher, IonRefresherContent,
  ],
  templateUrl: './client-list.page.html',
  styleUrl: './client-list.page.css',
})
export class ClientListPage implements OnInit {
  private readonly renewalsService = inject(RenewalsService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly items = signal<RenewalItem[]>([]);

  readonly filtro = signal<Filtro>('subscription');
  searchTerm = '';

  // ngOnInit ha già caricato i dati: al primo ingresso non serve rifarlo.
  private primoIngresso = true;

  constructor() {
    addIcons({
      add, cardOutline, barbellOutline, checkmarkCircleOutline,
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
    // Tornando dal dettaglio di un cliente un abbonamento potrebbe
    // essere stato appena rinnovato: senza questo, la voce resterebbe
    // fra gli scaduti finché non si ricarica manualmente.
    void this.load();
  }

  async refresh(event: Event): Promise<void> {
    await this.load();
    (event.target as HTMLIonRefresherElement).complete();
  }

  private async load(): Promise<void> {
    this.errorMessage.set(null);
    try {
      // Nessun parametro: restituisce ogni cliente con un abbonamento
      // o una scheda, indipendentemente da quanto lontana sia la data.
      const risposta = await this.renewalsService.list();
      this.items.set(risposta.items);
    } catch {
      this.errorMessage.set('Impossibile caricare i clienti.');
    } finally {
      this.loading.set(false);
    }
  }

  // ------------------------------------------------------------- filtro

  impostaFiltro(valore: string | number | undefined): void {
    this.filtro.set((valore as Filtro) ?? 'subscription');
  }

  readonly elementiFiltrati = computed(() => {
    const perTipo = this.items().filter((i) => i.type === this.filtro());

    const termine = this.searchTerm.trim().toLowerCase();
    if (!termine) return perTipo;

    return perTipo.filter(
      (i) =>
        i.clientName.toLowerCase().includes(termine) ||
        i.clientUsername.toLowerCase().includes(termine)
    );
  });

  readonly scaduti = computed(() =>
    this.elementiFiltrati().filter((i) => i.daysLeft < 0)
  );

  readonly urgenti = computed(() =>
    this.elementiFiltrati().filter((i) => i.daysLeft >= 0 && i.daysLeft <= GIORNI_URGENZA)
  );

  readonly inRegola = computed(() =>
    this.elementiFiltrati().filter((i) => i.daysLeft > GIORNI_URGENZA)
  );

  /** Totale scaduti o urgenti nella categoria, per il badge sul segmento. */
  totaleUrgente(tipo: RenewalType): number {
    return this.items().filter(
      (i) => i.type === tipo && i.daysLeft <= GIORNI_URGENZA
    ).length;
  }

  // -------------------------------------------------------- presentazione

  /**
   * Iniziale singola, coerente con gli avatar già in uso nelle pagine
   * di profilo (cliente e istruttore): stessa lettera, stesso criterio.
   */
  iniziale(nome: string): string {
    return (nome.trim()[0] ?? '?').toUpperCase();
  }

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

  vaiAlCliente(item: RenewalItem): void {
    void this.router.navigate(['/istruttore/clienti', item.clientId]);
  }
}
