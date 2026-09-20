import {
  Directive, ElementRef, Input, OnDestroy, OnInit, inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { GestureController, Gesture } from '@ionic/angular/standalone';

/**
 * Cambio scheda con lo scorrimento orizzontale.
 *
 * Ionic non lo offre di serie perche' e' facile che entri in conflitto
 * con altri gesti. Qui il rischio e' contenuto con tre accorgimenti:
 *
 * 1. il gesto parte solo se lo spostamento orizzontale supera nettamente
 *    quello verticale, cosi' lo scorrimento della pagina resta prioritario;
 * 2. viene ignorato se inizia sopra un elemento che scorre in orizzontale
 *    o che gestisce gia' il trascinamento (segmenti, riordino, cursori);
 * 3. serve uno spostamento ampio, non un tocco impreciso.
 *
 * I pulsanti della barra restano il modo principale di navigare:
 * lo scorrimento e' un'aggiunta, non un sostituto.
 */
@Directive({
  selector: '[appSwipeTabs]',
})
export class SwipeTabsDirective implements OnInit, OnDestroy {
  /** Percorsi delle schede, nello stesso ordine della barra. */
  @Input({ required: true }) appSwipeTabs: string[] = [];

  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly gestureCtrl = inject(GestureController);
  private readonly router = inject(Router);

  private gesture?: Gesture;


  /**
   * Diagnostica del gesto.
   *
   * Va messa a true solo per capire perche' lo scorrimento non risponde:
   * collegando il telefono e aprendo chrome://inspect sul PC si vede
   * se il gesto parte, con quali valori, e perche' viene scartato.
   */
  private static readonly DIAGNOSTICA = false;

  /** Spostamento minimo perche' il gesto conti come cambio scheda. */
  private static readonly SOGLIA_PX = 55;

  /** Quanto l'orizzontale deve superare il verticale. */
  private static readonly RAPPORTO = 1.5;

  /**
   * Elementi che gestiscono gia' il trascinamento orizzontale.
   * Partendo da uno di questi il gesto viene lasciato a loro.
   */
  private static readonly ESCLUSI = [
    'ion-segment',
    'ion-reorder',
    'ion-reorder-group',
    'ion-range',
    'ion-item-sliding',
    'ion-modal',
    'ion-slides',
    'swiper-container',
    '.chips-row',
    'input[type="range"]',
  ].join(',');

  ngOnInit(): void {
    this.gesture = this.gestureCtrl.create({
      /*
       * Il gesto e' agganciato al documento e non a ion-tabs.
       *
       * Il contenuto scorrevole vive dentro ion-content, che usa lo
       * scorrimento nativo del browser: gli eventi di tocco possono
       * essere assorbiti li' senza mai risalire fino a ion-tabs.
       * Ascoltando sul documento si intercettano comunque, e il filtro
       * in puoIniziare esclude le aree che devono gestirli da sole.
       */
      el: document,
      gestureName: 'cambio-scheda',
      /*
       * Ionic risolve la contesa fra gesti scegliendo la priorita' PIU ALTA
       * (nel suo codice: priority >= t.priority). Le priorita' interne vanno
       * da 0 a 110: il valore negativo usato all'inizio faceva perdere
       * sempre questo gesto, ed era il motivo per cui non accadeva nulla.
       *
       * 30 sta appena SOTTO il trascinamento per aggiornare (31), che deve
       * prevalere: con 41 il gesto orizzontale vinceva anche sui movimenti
       * verticali e impediva l'aggiornamento della pagina.
       *
       * Restare sotto 31 non impedisce allo scorrimento fra schede di
       * funzionare: la contesa si presenta solo quando due gesti vogliono
       * partire insieme, e il trascinamento per aggiornare reagisce ai
       * movimenti verticali, non a quelli orizzontali.
       */
      gesturePriority: 30,
      direction: 'x',
      /*
       * maxAngle predefinito e' 40 gradi: un cono cosi' ampio include
       * anche i trascinamenti verticali leggermente obliqui, che
       * venivano quindi catturati da questo gesto. Avendo priorita' 41
       * contro i 31 del trascinamento per aggiornare, il risultato era
       * che la pagina non si aggiornava piu'.
       *
       * A 20 gradi il gesto risponde solo a movimenti nettamente
       * orizzontali e lascia il resto a chi di dovere.
       */
      maxAngle: 20,
      // Soglia bassa: il riconoscimento vero avviene in onFine, dove si
      // confronta lo spostamento orizzontale con quello verticale.
      threshold: 10,
      canStart: (detail) => this.puoIniziare(detail.event),
      onEnd: (detail) => this.onFine(detail.deltaX, detail.deltaY),
    });

    this.gesture.enable(true);

    if (SwipeTabsDirective.DIAGNOSTICA) {
      console.log('[swipe] attivo su', this.appSwipeTabs);
    }
  }

  private puoIniziare(evento: Event): boolean {
    const bersaglio = evento.target as HTMLElement | null;
    if (!bersaglio?.closest) return false;

    // Solo dentro l'area a schede: fuori (es. finestre modali a tutto
    // schermo) il gesto non deve fare nulla.
    if (!bersaglio.closest('ion-tabs')) return false;

    return !bersaglio.closest(SwipeTabsDirective.ESCLUSI);
  }

  private onFine(deltaX: number, deltaY: number): void {

    const orizzontale = Math.abs(deltaX);
    const verticale = Math.abs(deltaY);

    if (SwipeTabsDirective.DIAGNOSTICA) {
      console.log('[swipe] gesto concluso', {
        deltaX, deltaY,
        soglia: SwipeTabsDirective.SOGLIA_PX,
        url: this.router.url,
      });
    }

    if (orizzontale < SwipeTabsDirective.SOGLIA_PX) {
      if (SwipeTabsDirective.DIAGNOSTICA) console.log('[swipe] scartato: troppo breve');
      return;
    }
    if (orizzontale < verticale * SwipeTabsDirective.RAPPORTO) {
      if (SwipeTabsDirective.DIAGNOSTICA) console.log('[swipe] scartato: troppo verticale');
      return;
    }

    // Verso sinistra si va avanti, verso destra si torna indietro:
    // il contenuto segue il dito.
    this.vaiA(deltaX < 0 ? 1 : -1);
  }

  private vaiA(direzione: 1 | -1): void {
    const schede = this.appSwipeTabs;
    if (schede.length === 0) return;

    const corrente = this.schedaCorrente(schede);
    if (corrente < 0) {
      if (SwipeTabsDirective.DIAGNOSTICA) {
        console.log('[swipe] scartato: non e\' una pagina radice', this.router.url);
      }
      return;
    }

    const destinazione = corrente + direzione;
    // Nessun ciclo: alla prima e all'ultima scheda il gesto non fa nulla,
    // cosi' non si finisce dall'altra parte per errore.
    if (destinazione < 0 || destinazione >= schede.length) {
      if (SwipeTabsDirective.DIAGNOSTICA) console.log('[swipe] scartato: margine della barra');
      return;
    }

    if (SwipeTabsDirective.DIAGNOSTICA) {
      console.log('[swipe] cambio scheda ->', schede[destinazione]);
    }
    void this.router.navigate([this.percorsoBase(), schede[destinazione]]);
  }

  /**
   * Indice della scheda corrente, ma solo se ci si trova sulla sua pagina
   * radice.
   *
   * Il confronto e' sul segmento esatto e sulla profondita' del percorso:
   * cercando la scheda con una semplice ricerca di sottostringa,
   * "/istruttore/clienti/5" verrebbe riconosciuto come la scheda "clienti"
   * e lo scorrimento farebbe perdere il dettaglio aperto.
   */
  private schedaCorrente(schede: string[]): number {
    const segmenti = this.router.url.split('?')[0].split('/').filter(Boolean);
    if (segmenti.length !== 2) return -1;
    return schede.indexOf(segmenti[1]);
  }

  /** Ricava "/cliente" o "/istruttore" dall'indirizzo corrente. */
  private percorsoBase(): string {
    return '/' + this.router.url.split('/').filter(Boolean)[0];
  }

  ngOnDestroy(): void {
    this.gesture?.destroy();
  }
}
