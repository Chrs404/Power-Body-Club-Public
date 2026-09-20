import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';

/** Versione di questa build. Va alzata a ogni pubblicazione. */
export const VERSIONE_APP = '1.0.0';

interface RispostaVersione {
  minVersion: string;
  updateUrl: string;
}

/**
 * Controllo della versione minima richiesta.
 *
 * Quando una modifica al backend rende inutilizzabili le versioni
 * precedenti, alzare MIN_APP_VERSION su Render fa comparire una
 * schermata di invito all'aggiornamento: meglio di errori sparsi
 * e incomprensibili in giro per l'app.
 */
@Injectable({ providedIn: 'root' })
export class VersionService {
  private readonly http = inject(HttpClient);

  readonly aggiornamentoRichiesto = signal(false);
  readonly urlAggiornamento = signal('');

  /**
   * Confronta due versioni nel formato "maggiore.minore.correzione".
   * Restituisce un numero negativo se a precede b, zero se coincidono,
   * positivo se a segue b.
   *
   * Il confronto e' numerico e non alfabetico: come stringhe "1.10.0"
   * risulterebbe minore di "1.9.0", perche' il carattere "1" viene
   * prima di "9".
   */
  static confronta(a: string, b: string): number {
    const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
    const pb = b.split('.').map((n) => parseInt(n, 10) || 0);

    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const differenza = (pa[i] ?? 0) - (pb[i] ?? 0);
      if (differenza !== 0) return differenza;
    }
    return 0;
  }

  /**
   * Verifica la versione all'avvio.
   *
   * Qualsiasi errore viene ignorato di proposito: se il server non
   * risponde, l'app deve funzionare comunque. Bloccare l'accesso per un
   * controllo di versione fallito sarebbe peggio del problema che risolve.
   */
  async verifica(): Promise<void> {
    try {
      const risposta = await firstValueFrom(
        this.http.get<RispostaVersione>(`${API_BASE_URL}/version`)
      );

      if (VersionService.confronta(VERSIONE_APP, risposta.minVersion) < 0) {
        this.urlAggiornamento.set(risposta.updateUrl ?? '');
        this.aggiornamentoRichiesto.set(true);
      }
    } catch {
      // Server irraggiungibile o rotta assente: si prosegue normalmente.
    }
  }
}
