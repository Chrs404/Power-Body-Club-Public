import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  IonContent, IonHeader, IonToolbar, IonSpinner, IonIcon,
  IonRefresher, IonRefresherContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, searchOutline, chevronForwardOutline } from 'ionicons/icons';

import { RenewalsService } from '../../../../core/services/renewals.service';
import { DeletionItem, RenewalItem } from '../../../../core/models/renewals.model';
import { ClientDetailPage } from '../detail/client-detail.page';

type Filtro = 'tutti' | 'rinnovi' | 'eliminazione';
type Tono = 'ok' | 'warn' | 'bad' | '';

/** Una scadenza futura entro questa soglia e' "da rinnovare". */
const GIORNI_URGENZA = 7;

/** Un cliente con lo stato di abbonamento e scheda insieme, in una riga. */
interface RigaCliente {
  clientId: number;
  nome: string;
  username: string;
  abbonamento: RenewalItem | null;
  scheda: RenewalItem | null;
  eliminazione: DeletionItem | null;
}

/**
 * Clienti: ogni cliente attivo in una riga, con lo stato di abbonamento e
 * scheda affiancati. Prima i due stati stavano su due viste separate
 * (Abbonamenti / Schede) e per sapere tutto di un cliente bisognava
 * passare dall'una all'altra.
 *
 * "Ogni cliente" e' da prendere alla lettera: anche chi non ha
 * abbonamento ne' scheda compare, in fondo, altrimenti un cliente appena
 * creato senza date non sarebbe piu' raggiungibile.
 *
 * Sul computer la pagina si divide in due: elenco a sinistra e dettaglio
 * del cliente scelto a destra, senza cambiare pagina.
 */
@Component({
  selector: 'app-client-list',
  imports: [
    RouterLink, ClientDetailPage,
    IonContent, IonHeader, IonToolbar, IonSpinner, IonIcon,
    IonRefresher, IonRefresherContent,
  ],
  templateUrl: './client-list.page.html',
  styleUrl: './client-list.page.css',
})
export class ClientListPage implements OnInit {
  private readonly renewalsService = inject(RenewalsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly items = signal<RenewalItem[]>([]);
  readonly eliminazioni = signal<DeletionItem[]>([]);

  readonly filtro = signal<Filtro>('tutti');
  readonly searchTerm = signal('');

  /** Schermo largo: elenco e dettaglio affiancati. */
  readonly largo = signal(false);
  /** Cliente aperto nella colonna di destra (solo su schermo largo). */
  readonly selezionato = signal<number | null>(null);

  // ngOnInit ha già caricato i dati: al primo ingresso non serve rifarlo.
  private primoIngresso = true;

  constructor() {
    addIcons({ addOutline, searchOutline, chevronForwardOutline });

    const media = window.matchMedia('(min-width: 1200px)');
    this.largo.set(media.matches);
    const cambio = (e: MediaQueryListEvent) => this.largo.set(e.matches);
    media.addEventListener('change', cambio);
    this.destroyRef.onDestroy(() => media.removeEventListener('change', cambio));
  }

  ngOnInit(): void {
    // ?filtro= arriva dai riquadri della Home.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p) => {
      const f = p.get('filtro');
      if (f === 'rinnovi' || f === 'eliminazione' || f === 'tutti') this.filtro.set(f);
    });
    void this.load();
  }

  ionViewWillEnter(): void {
    if (this.primoIngresso) {
      this.primoIngresso = false;
      return;
    }
    // Tornando dal dettaglio un abbonamento potrebbe essere stato appena rinnovato.
    void this.load();
  }

  async refresh(event: Event): Promise<void> {
    await this.load();
    (event.target as HTMLIonRefresherElement).complete();
  }

  async load(): Promise<void> {
    this.errorMessage.set(null);
    try {
      const risposta = await this.renewalsService.list();
      this.items.set(risposta.items);
      this.eliminazioni.set(risposta.deletions ?? []);

      // Un cliente appena eliminato non resta aperto a destra.
      const sel = this.selezionato();
      if (sel !== null && !risposta.items.some((i) => i.clientId === sel)) {
        this.selezionato.set(null);
      }
    } catch {
      this.errorMessage.set('Impossibile caricare i clienti.');
    } finally {
      this.loading.set(false);
    }
  }

  aggiornaRicerca(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value ?? '');
  }

  // ------------------------------------------------------------- elenco

  private readonly righe = computed<RigaCliente[]>(() => {
    const perCliente = new Map<number, RigaCliente>();
    for (const i of this.items()) {
      const riga = perCliente.get(i.clientId) ?? {
        clientId: i.clientId, nome: i.clientName, username: i.clientUsername,
        abbonamento: null, scheda: null, eliminazione: null,
      };
      if (i.type === 'subscription') riga.abbonamento = i;
      else riga.scheda = i;
      perCliente.set(i.clientId, riga);
    }
    for (const e of this.eliminazioni()) {
      const riga = perCliente.get(e.clientId);
      if (riga) riga.eliminazione = e;
    }

    const urgenza = (r: RigaCliente): number => {
      if (r.eliminazione) return -100_000 + r.eliminazione.daysLeft;
      const giorni = [r.abbonamento?.daysLeft, r.scheda?.daysLeft].filter(
        (g): g is number => g !== null && g !== undefined
      );
      return giorni.length > 0 ? Math.min(...giorni) : 100_000;
    };

    return [...perCliente.values()].sort(
      (a, b) => urgenza(a) - urgenza(b) || a.nome.localeCompare(b.nome, 'it')
    );
  });

  private daRinnovare(r: RigaCliente): boolean {
    return [r.abbonamento, r.scheda].some(
      (i) => i?.daysLeft !== null && i?.daysLeft !== undefined && i.daysLeft <= GIORNI_URGENZA
    );
  }

  readonly contaRinnovi = computed(() => this.righe().filter((r) => this.daRinnovare(r)).length);

  readonly elenco = computed(() => {
    let righe = this.righe();
    if (this.filtro() === 'rinnovi') righe = righe.filter((r) => this.daRinnovare(r));
    if (this.filtro() === 'eliminazione') righe = righe.filter((r) => r.eliminazione !== null);

    const termine = this.searchTerm().trim().toLowerCase();
    if (!termine) return righe;
    return righe.filter(
      (r) => r.nome.toLowerCase().includes(termine) || r.username.toLowerCase().includes(termine)
    );
  });

  // -------------------------------------------------------- presentazione

  iniziale(nome: string): string {
    return (nome.trim()[0] ?? '?').toUpperCase();
  }

  /** Testo e colore della pillola di abbonamento o scheda. */
  pillola(item: RenewalItem | null, tipo: 'subscription' | 'workout'): { testo: string; tono: Tono } {
    const cosa = tipo === 'subscription' ? 'Abbonamento' : 'Scheda';
    const g = item?.daysLeft ?? null;
    if (g === null) {
      return { testo: tipo === 'subscription' ? 'Nessun abbonamento' : 'Nessuna scheda', tono: '' };
    }
    if (g < 0) return { testo: `${cosa} scadut${tipo === 'subscription' ? 'o' : 'a'}`, tono: 'bad' };
    if (g === 0) return { testo: `${cosa} scade oggi`, tono: 'warn' };
    return { testo: `${cosa} ${g} gg`, tono: g <= GIORNI_URGENZA ? 'warn' : 'ok' };
  }

  testoEliminazione(e: DeletionItem): string {
    if (e.daysLeft <= 0) return 'In eliminazione a breve';
    return `In eliminazione fra ${e.daysLeft} gg`;
  }

  apri(riga: RigaCliente): void {
    if (this.largo()) {
      this.selezionato.set(riga.clientId);
    } else {
      void this.router.navigate(['/istruttore/clienti', riga.clientId]);
    }
  }
}
