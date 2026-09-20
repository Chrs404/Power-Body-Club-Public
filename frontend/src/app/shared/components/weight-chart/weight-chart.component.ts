import { Component, Input, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';

export interface PuntoPeso {
  data: string;
  peso: number;
}

interface PuntoDisegnato {
  x: number;
  y: number;
  peso: number;
  data: string;
}

/**
 * Andamento di un peso nel tempo.
 *
 * Disegnato in SVG a mano invece di usare una libreria di grafici:
 * serve una sola linea con pochi punti, e una libreria come Chart.js
 * aggiungerebbe centinaia di kilobyte al pacchetto per un risultato
 * che qui si ottiene con qualche calcolo.
 */
@Component({
  selector: 'app-weight-chart',
  imports: [DecimalPipe],
  templateUrl: './weight-chart.component.html',
  styleUrl: './weight-chart.component.css',
})
export class WeightChartComponent {
  /** Punti in ordine cronologico crescente. */
  @Input({ required: true }) set punti(valore: PuntoPeso[]) {
    this._punti.set(valore);
  }

  private readonly _punti = signal<PuntoPeso[]>([]);
  readonly selezionato = signal<PuntoDisegnato | null>(null);

  // Coordinate interne del disegno; l'SVG viene poi scalato dal CSS
  private readonly L = 300;
  private readonly A = 120;
  private readonly PAD_X = 10;
  private readonly PAD_Y = 14;

  readonly haDatiSufficienti = computed(() => this._punti().length >= 2);

  readonly minimo = computed(() => Math.min(...this._punti().map((p) => p.peso)));
  readonly massimo = computed(() => Math.max(...this._punti().map((p) => p.peso)));

  /**
   * Variazione fra primo e ultimo valore: e' l'informazione che
   * interessa davvero, il grafico mostra come ci si e' arrivati.
   */
  readonly variazione = computed(() => {
    const p = this._punti();
    if (p.length < 2) return null;
    return Math.round((p[p.length - 1].peso - p[0].peso) * 100) / 100;
  });

  readonly disegnati = computed<PuntoDisegnato[]>(() => {
    const punti = this._punti();
    if (punti.length === 0) return [];

    const min = this.minimo();
    const max = this.massimo();

    /*
     * Con un solo valore, o con valori tutti uguali, l'intervallo sarebbe
     * zero: la divisione darebbe NaN e il grafico sparirebbe.
     * In quel caso la linea va a meta' altezza.
     */
    const intervallo = max - min || 1;
    const larghezzaUtile = this.L - this.PAD_X * 2;
    const altezzaUtile = this.A - this.PAD_Y * 2;

    return punti.map((p, i) => ({
      x:
        punti.length === 1
          ? this.L / 2
          : this.PAD_X + (larghezzaUtile * i) / (punti.length - 1),
      y:
        max === min
          ? this.A / 2
          : this.PAD_Y + altezzaUtile - ((p.peso - min) / intervallo) * altezzaUtile,
      peso: p.peso,
      data: p.data,
    }));
  });

  readonly linea = computed(() =>
    this.disegnati()
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ')
  );

  /** Stessa spezzata chiusa in basso, per la sfumatura sottostante. */
  readonly area = computed(() => {
    const p = this.disegnati();
    if (p.length < 2) return '';
    return `${this.linea()} L ${p[p.length - 1].x.toFixed(1)} ${this.A} L ${p[0].x.toFixed(1)} ${this.A} Z`;
  });

  readonly viewBox = computed(() => `0 0 ${this.L} ${this.A}`);

  seleziona(punto: PuntoDisegnato): void {
    const attuale = this.selezionato();
    this.selezionato.set(attuale?.x === punto.x ? null : punto);
  }

  formattaData(iso: string): string {
    return new Date(iso).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      timeZone: 'UTC',
    });
  }
}
