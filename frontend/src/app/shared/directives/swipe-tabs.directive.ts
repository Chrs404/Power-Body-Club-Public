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
 *
 * Animazione: durante il gesto la pagina segue il dito. Al rilascio, se
 * il gesto vale, scivola via e sfuma; la nuova pagina entra dal lato da
 * cui arriva il dito, cosi' si capisce in che direzione ci si e' mossi.
 * Se il gesto non vale, la pagina torna al suo posto. Alla prima e
 * all'ultima scheda la pagina oppone resistenza invece di muoversi
 * libera, per far capire che di la' non c'e' altro.
 *
 * Chi ha chiesto al telefono di ridurre le animazioni le ottiene ridotte:
 * il cambio di scheda torna istantaneo come prima.
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

  /** Pagina che si sta trascinando, con i dati per animarla. */
  private trascinamento: {
    pagina: HTMLElement;
    indice: number;
    larghezza: number;
    spostamento: number;
  } | null = null;

  /** Vero fra il rilascio del dito e la comparsa della nuova pagina. */
  private occupato = false;

  /**
   * Punto in cui il dito ha toccato lo schermo.
   *
   * Ionic, nel momento in cui riconosce il gesto, sposta il suo punto di
   * partenza alla posizione attuale del dito: i primi 15-30 px di corsa
   * vanno persi nei suoi deltaX. Misurato con eventi touch reali, un
   * colpo di 45 px risultava di 15. Le distanze si calcolano quindi da
   * qui, cosi' la pagina segue il dito dal primo millimetro e la soglia
   * di 55 px corrisponde a 55 px veri.
   */
  private inizioX = 0;
  private inizioY = 0;

  /**
   * Posizioni recenti del dito, per calcolare la velocita' al rilascio.
   *
   * La velocita' fornita da Ionic e' una media mobile che resta indietro:
   * misurata, un colpo a 0.48 px/ms verso sinistra risultava 0.16, e il
   * cambio di scheda non scattava. Qui si usa lo spostamento reale degli
   * ultimi 100 ms.
   */
  private campioni: { t: number; x: number }[] = [];
  private static readonly FINESTRA_VELOCITA_MS = 100;

  private readonly riduciAnimazioni =
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Millisecondi dell'uscita della pagina vecchia e dell'entrata della nuova. */
  private static readonly DURATA_USCITA = 140;
  private static readonly DURATA_ENTRATA = 220;

  /** Frazione della larghezza da cui entra la nuova pagina. */
  private static readonly ENTRATA_DA = 0.25;

  /** Ai bordi della barra la pagina si muove solo di questa frazione del dito. */
  private static readonly RESISTENZA_BORDO = 0.2;

  /** Velocita' (px/ms) oltre la quale anche un colpo breve cambia scheda. */
  private static readonly VELOCITA_MIN = 0.4;


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
      canStart: (detail) => {
        this.inizioX = detail.startX;
        this.inizioY = detail.startY;
        this.campioni = [{ t: detail.currentTime, x: detail.startX }];
        return this.puoIniziare(detail.event);
      },
      onStart: () => this.onInizio(),
      onMove: (detail) => {
        this.annotaPosizione(detail.currentTime, detail.currentX);
        this.onMovimento(detail.currentX - this.inizioX);
      },
      onEnd: (detail) => {
        this.annotaPosizione(detail.currentTime, detail.currentX);
        this.onFine(
          detail.currentX - this.inizioX,
          detail.currentY - this.inizioY,
          this.velocitaFinale()
        );
      },
    });

    this.gesture.enable(true);

    if (SwipeTabsDirective.DIAGNOSTICA) {
      console.log('[swipe] attivo su', this.appSwipeTabs);
    }
  }

  private puoIniziare(evento: Event): boolean {
    // Un secondo gesto mentre la pagina sta ancora cambiando troverebbe
    // a meta' strada sia la vecchia sia la nuova.
    if (this.occupato) return false;

    const bersaglio = evento.target as HTMLElement | null;
    if (!bersaglio?.closest) return false;

    // Solo dentro l'area a schede: fuori (es. finestre modali a tutto
    // schermo) il gesto non deve fare nulla.
    if (!bersaglio.closest('ion-tabs')) return false;

    return !bersaglio.closest(SwipeTabsDirective.ESCLUSI);
  }

  private annotaPosizione(t: number, x: number): void {
    this.campioni.push({ t, x });
    if (this.campioni.length > 20) this.campioni.shift();
  }

  /** Velocita' orizzontale in px/ms negli ultimi 100 ms del gesto. */
  private velocitaFinale(): number {
    const ultimo = this.campioni[this.campioni.length - 1];
    if (!ultimo) return 0;
    const primo =
      this.campioni.find((c) => ultimo.t - c.t <= SwipeTabsDirective.FINESTRA_VELOCITA_MS) ??
      ultimo;
    const durata = ultimo.t - primo.t;
    return durata > 0 ? (ultimo.x - primo.x) / durata : 0;
  }

  /** Il gesto e' partito: si prende la pagina visibile per trascinarla. */
  private onInizio(): void {
    this.trascinamento = null;
    if (this.riduciAnimazioni) return;

    const indice = this.schedaCorrente(this.appSwipeTabs);
    const pagina = this.paginaVisibile();
    if (indice < 0 || !pagina) return;

    this.ripulisci(pagina);
    pagina.style.willChange = 'transform, opacity';
    this.trascinamento = {
      pagina,
      indice,
      larghezza: pagina.clientWidth || window.innerWidth,
      spostamento: 0,
    };
  }

  /** La pagina segue il dito, con resistenza se di la' non c'e' una scheda. */
  private onMovimento(deltaX: number): void {
    const t = this.trascinamento;
    if (!t) return;

    const verso = deltaX < 0 ? 1 : -1;
    const destinazione = t.indice + verso;
    const esiste = destinazione >= 0 && destinazione < this.appSwipeTabs.length;

    t.spostamento = esiste ? deltaX : deltaX * SwipeTabsDirective.RESISTENZA_BORDO;
    this.posiziona(t.pagina, t.spostamento, t.larghezza);
  }

  private onFine(deltaX: number, deltaY: number, velocitaX = 0): void {
    const t = this.trascinamento;
    this.trascinamento = null;

    const orizzontale = Math.abs(deltaX);
    const verticale = Math.abs(deltaY);

    if (SwipeTabsDirective.DIAGNOSTICA) {
      console.log('[swipe] gesto concluso', {
        deltaX, deltaY, velocitaX,
        soglia: SwipeTabsDirective.SOGLIA_PX,
        url: this.router.url,
      });
    }

    // Un colpo rapido nella stessa direzione vale anche se breve: e' il
    // modo naturale di sfogliare, e chiedere sempre 55 px lo rende rigido.
    const colpoRapido =
      Math.abs(velocitaX) >= SwipeTabsDirective.VELOCITA_MIN &&
      Math.sign(velocitaX) === Math.sign(deltaX) &&
      orizzontale >= 20;

    if (orizzontale < SwipeTabsDirective.SOGLIA_PX && !colpoRapido) {
      if (SwipeTabsDirective.DIAGNOSTICA) console.log('[swipe] scartato: troppo breve');
      if (t) this.tornaAlPosto(t);
      return;
    }
    if (orizzontale < verticale * SwipeTabsDirective.RAPPORTO) {
      if (SwipeTabsDirective.DIAGNOSTICA) console.log('[swipe] scartato: troppo verticale');
      if (t) this.tornaAlPosto(t);
      return;
    }

    // Verso sinistra si va avanti, verso destra si torna indietro:
    // il contenuto segue il dito.
    const verso: 1 | -1 = deltaX < 0 ? 1 : -1;
    const destinazione = this.destinazione(verso);
    if (destinazione === null) {
      if (t) this.tornaAlPosto(t);
      return;
    }

    if (!t) {
      // Animazioni ridotte, o pagina non trovata: cambio istantaneo.
      void this.router.navigate([this.percorsoBase(), destinazione]);
      return;
    }
    void this.cambiaConAnimazione(t, verso, destinazione);
  }

  /**
   * La pagina vecchia esce, poi si naviga e la nuova entra.
   *
   * In sequenza e non insieme: Ionic nasconde la pagina vecchia nello
   * stesso istante in cui mostra la nuova, quindi un'uscita ancora in
   * corso verrebbe troncata a meta'.
   */
  private async cambiaConAnimazione(
    t: NonNullable<SwipeTabsDirective['trascinamento']>,
    verso: 1 | -1,
    destinazione: string
  ): Promise<void> {
    this.occupato = true;
    const { pagina, larghezza } = t;
    let riuscito = false;

    try {
      const uscita = pagina.animate(
        [
          { transform: `translate3d(${t.spostamento}px,0,0)`, opacity: this.opacita(t.spostamento, larghezza) },
          { transform: `translate3d(${-verso * larghezza * 0.5}px,0,0)`, opacity: 0 },
        ],
        {
          duration: SwipeTabsDirective.DURATA_USCITA,
          easing: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
          fill: 'forwards',
        }
      );
      await uscita.finished.catch(() => undefined);

      const arrivo = this.attendiNuovaPagina(pagina, verso, larghezza);
      const navigato = await this.router.navigate([this.percorsoBase(), destinazione]);
      riuscito = (await arrivo) && navigato === true;

      // Ionic mostra la nuova pagina qualche fotogramma PRIMA di nascondere
      // la vecchia. Ripulendo subito, la vecchia tornava per un istante al
      // centro e a piena opacita' sotto quella che entrava: un lampo.
      // Finche' non sparisce resta com'e' l'ha lasciata l'uscita, invisibile.
      if (riuscito) await this.attendiNascosta(pagina);
    } finally {
      // Ionic tiene in memoria la pagina che abbiamo lasciato: se restasse
      // spostata, tornandoci la si troverebbe fuori dallo schermo.
      this.ripulisci(pagina);
      this.occupato = false;

      if (!riuscito) {
        // Navigazione non avvenuta (bloccata da un guard, errore): la
        // pagina vecchia e' ancora quella giusta, e ricompare sfumando.
        // Dopo la pulizia, altrimenti verrebbe annullata anche questa.
        pagina.animate(
          [{ opacity: 0 }, { opacity: 1 }],
          { duration: SwipeTabsDirective.DURATA_ENTRATA }
        );
      }
    }
  }

  /**
   * Fa entrare la nuova pagina appena Ionic la rende visibile.
   *
   * Si osservano le modifiche al DOM invece di aspettare la fine della
   * navigazione: il callback dell'osservatore gira prima che il browser
   * disegni, quindi la pagina parte gia' spostata e trasparente. Animandola
   * dopo, si vedrebbe per un istante al suo posto e poi saltare indietro.
   */
  private attendiNuovaPagina(
    vecchia: HTMLElement,
    verso: 1 | -1,
    larghezza: number
  ): Promise<boolean> {
    const contenitore = vecchia.parentElement;
    if (!contenitore) return Promise.resolve(false);

    return new Promise((risolvi) => {
      let concluso = false;

      const controlla = () => {
        if (concluso) return;
        const nuova = this.paginaVisibile(vecchia);
        if (!nuova) return;

        concluso = true;
        osservatore.disconnect();
        clearTimeout(scadenza);

        nuova.animate(
          [
            {
              transform: `translate3d(${verso * larghezza * SwipeTabsDirective.ENTRATA_DA}px,0,0)`,
              opacity: 0,
            },
            { transform: 'translate3d(0,0,0)', opacity: 1 },
          ],
          {
            duration: SwipeTabsDirective.DURATA_ENTRATA,
            easing: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
          }
        );
        risolvi(true);
      };

      const osservatore = new MutationObserver(controlla);
      osservatore.observe(contenitore, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      });

      // Rete d'emergenza: se la pagina non compare, si smette di aspettare.
      const scadenza = setTimeout(() => {
        if (concluso) return;
        concluso = true;
        osservatore.disconnect();
        risolvi(false);
      }, 1000);

      controlla();
    });
  }

  /** Si risolve quando Ionic ha nascosto la pagina, o l'ha tolta dal DOM. */
  private attendiNascosta(pagina: HTMLElement): Promise<void> {
    const nascosta = () =>
      !pagina.isConnected || pagina.classList.contains('ion-page-hidden');
    if (nascosta()) return Promise.resolve();

    return new Promise((risolvi) => {
      const fine = () => {
        osservatore.disconnect();
        clearTimeout(scadenza);
        risolvi();
      };
      const osservatore = new MutationObserver(() => {
        if (nascosta()) fine();
      });
      osservatore.observe(pagina, { attributes: true, attributeFilter: ['class'] });
      if (pagina.parentElement) {
        osservatore.observe(pagina.parentElement, { childList: true });
      }
      const scadenza = setTimeout(fine, 1000);
    });
  }

  /** Gesto non valido: la pagina torna dove era. */
  private tornaAlPosto(t: NonNullable<SwipeTabsDirective['trascinamento']>): void {
    const { pagina, larghezza, spostamento } = t;
    if (spostamento === 0) {
      this.ripulisci(pagina);
      return;
    }

    const ritorno = pagina.animate(
      [
        { transform: `translate3d(${spostamento}px,0,0)`, opacity: this.opacita(spostamento, larghezza) },
        { transform: 'translate3d(0,0,0)', opacity: 1 },
      ],
      { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
    );
    // Lo stile del trascinamento va tolto subito: l'animazione parte dagli
    // stessi valori, quindi non si vede alcun salto.
    this.ripulisci(pagina, false);
    void ritorno.finished.catch(() => undefined);
  }

  private posiziona(pagina: HTMLElement, spostamento: number, larghezza: number): void {
    pagina.style.transform = `translate3d(${spostamento}px,0,0)`;
    pagina.style.opacity = String(this.opacita(spostamento, larghezza));
  }

  /** Allontanandosi la pagina sfuma un poco, fino al 70% a schermo intero. */
  private opacita(spostamento: number, larghezza: number): number {
    return 1 - Math.min(Math.abs(spostamento) / larghezza, 1) * 0.3;
  }

  /** Toglie spostamento, trasparenza e animazioni lasciate sulla pagina. */
  private ripulisci(pagina: HTMLElement, annullaAnimazioni = true): void {
    if (annullaAnimazioni) {
      pagina.getAnimations?.().forEach((a) => a.cancel());
    }
    pagina.style.transform = '';
    pagina.style.opacity = '';
    pagina.style.willChange = '';
  }

  /**
   * La pagina della scheda attualmente visibile. Ionic tiene nel DOM anche
   * quelle gia' visitate, nascoste con la classe ion-page-hidden.
   */
  private paginaVisibile(esclusa?: HTMLElement): HTMLElement | null {
    const contenitore = this.elementRef.nativeElement.querySelector('ion-router-outlet');
    if (!contenitore) return null;

    for (const figlio of Array.from(contenitore.children) as HTMLElement[]) {
      if (
        figlio !== esclusa &&
        figlio.classList.contains('ion-page') &&
        !figlio.classList.contains('ion-page-hidden')
      ) {
        return figlio;
      }
    }
    return null;
  }

  /** Percorso della scheda vicina in quella direzione, o null se non c'e'. */
  private destinazione(verso: 1 | -1): string | null {
    const schede = this.appSwipeTabs;
    if (schede.length === 0) return null;

    const corrente = this.schedaCorrente(schede);
    if (corrente < 0) {
      if (SwipeTabsDirective.DIAGNOSTICA) {
        console.log('[swipe] scartato: non e\' una pagina radice', this.router.url);
      }
      return null;
    }

    const indice = corrente + verso;
    // Nessun ciclo: alla prima e all'ultima scheda il gesto non fa nulla,
    // cosi' non si finisce dall'altra parte per errore.
    if (indice < 0 || indice >= schede.length) {
      if (SwipeTabsDirective.DIAGNOSTICA) console.log('[swipe] scartato: margine della barra');
      return null;
    }

    if (SwipeTabsDirective.DIAGNOSTICA) {
      console.log('[swipe] cambio scheda ->', schede[indice]);
    }
    return schede[indice];
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
    if (this.trascinamento) this.ripulisci(this.trascinamento.pagina);
  }
}
