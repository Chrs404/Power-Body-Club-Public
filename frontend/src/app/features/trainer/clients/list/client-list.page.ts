import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonContent, IonHeader, IonTitle, IonToolbar, IonSearchbar,
  IonSegment, IonSegmentButton, IonLabel, IonSpinner, IonList, IonItem,
  IonListHeader, IonIcon, IonFab, IonFabButton, IonRefresher, IonRefresherContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  add, cardOutline, barbellOutline, checkmarkCircleOutline,
  alertCircleOutline, timeOutline, chevronForwardOutline, ellipseOutline,
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
 * Qui non c'e' alcuna finestra temporale: ogni cliente attivo e'
 * visibile, ordinato per urgenza, cosi' la vista resta completa
 * invece di nascondere chi e' semplicemente in regola.
 *
 * "Ogni cliente" e' da prendere alla lettera, ed e' il motivo per cui
 * esiste il gruppo in fondo: anche chi non ha alcun abbonamento deve
 * comparire, altrimenti l'istruttore non ha modo di raggiungerlo — ne'
 * scorrendo, ne' cercando, perche' la ricerca filtra questo stesso
 * elenco. Era esattamente il caso di un cliente appena creato senza
 * date di abbonamento: spariva subito dopo essere stato inserito.
 */
@Component({
  selector: 'app-client-list',
  imports: [
    RouterLink,
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

  /*
   * Signal, non una proprieta' normale, ed e' il punto in cui questa
   * pagina si era rotta: `elementiFiltrati` e' un computed, e un
   * computed si ricalcola solo quando cambia un signal da cui dipende.
   * Con `searchTerm` proprieta' semplice, digitare non lo svegliava:
   * l'elenco si aggiornava solo quando cambiava `items()`, cioe' al
   * ricaricamento della pagina.
   */
  readonly searchTerm = signal('');

  // ngOnInit ha già caricato i dati: al primo ingresso non serve rifarlo.
  private primoIngresso = true;

  constructor() {
    addIcons({
      add, cardOutline, barbellOutline, checkmarkCircleOutline,
      alertCircleOutline, timeOutline, chevronForwardOutline, ellipseOutline,
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
      // Nessun parametro: restituisce ogni cliente attivo, con o senza
      // scadenze, indipendentemente da quanto lontana sia la data.
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

  /**
   * Aggiorna il testo cercato a ogni battuta.
   *
   * Sostituisce il precedente [(ngModel)]: la scrittura deve passare
   * per .set(), altrimenti il computed non viene avvisato.
   */
  aggiornaRicerca(event: Event): void {
    const valore = (event as CustomEvent<{ value?: string | null }>).detail?.value;
    this.searchTerm.set(valore ?? '');
  }

  readonly elementiFiltrati = computed(() => {
    const perTipo = this.items().filter((i) => i.type === this.filtro());

    const termine = this.searchTerm().trim().toLowerCase();
    if (!termine) return perTipo;

    return perTipo.filter(
      (i) =>
        i.clientName.toLowerCase().includes(termine) ||
        i.clientUsername.toLowerCase().includes(termine)
    );
  });

  readonly scaduti = computed(() =>
    this.elementiFiltrati().filter((i) => i.daysLeft !== null && i.daysLeft < 0)
  );

  readonly urgenti = computed(() =>
    this.elementiFiltrati().filter(
      (i) => i.daysLeft !== null && i.daysLeft >= 0 && i.daysLeft <= GIORNI_URGENZA
    )
  );

  readonly inRegola = computed(() =>
    this.elementiFiltrati().filter((i) => i.daysLeft !== null && i.daysLeft > GIORNI_URGENZA)
  );

  /**
   * Clienti senza abbonamento (o senza scheda, sull'altra scheda del
   * segmento). Vanno in fondo di proposito: non hanno una scadenza, e
   * mescolarli agli scaduti confonderebbe chi non ha mai sottoscritto
   * con chi ha lasciato scadere qualcosa.
   */
  readonly senzaScadenza = computed(() =>
    this.elementiFiltrati().filter((i) => i.daysLeft === null)
  );

  /**
   * Totale scaduti o urgenti nella categoria, per il badge sul segmento.
   * Il controllo su null è necessario: senza, `null <= 7` sarebbe vero
   * e i clienti senza abbonamento gonfierebbero il contatore.
   */
  totaleUrgente(tipo: RenewalType): number {
    return this.items().filter(
      (i) => i.type === tipo && i.daysLeft !== null && i.daysLeft <= GIORNI_URGENZA
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

  livelloUrgenza(item: RenewalItem): 'scaduto' | 'urgente' | 'in-arrivo' | 'assente' {
    if (item.daysLeft === null) return 'assente';
    if (item.daysLeft < 0) return 'scaduto';
    if (item.daysLeft <= GIORNI_URGENZA) return 'urgente';
    return 'in-arrivo';
  }

  testoScadenza(item: RenewalItem): string {
    const g = item.daysLeft;
    // Senza scadenza non c'e' nulla da scrivere nel badge: il
    // sottotitolo dice gia' "Nessun abbonamento".
    if (g === null) return '';
    if (g < 0) return g === -1 ? 'Scaduto ieri' : `Scaduto da ${-g} giorni`;
    if (g === 0) return 'Scade oggi';
    if (g === 1) return 'Scade domani';
    return `Scade fra ${g} giorni`;
  }

  vaiAlCliente(item: RenewalItem): void {
    void this.router.navigate(['/istruttore/clienti', item.clientId]);
  }
}