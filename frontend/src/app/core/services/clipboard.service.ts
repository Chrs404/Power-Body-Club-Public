import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';
import { ToastController } from '@ionic/angular/standalone';

/**
 * Copia negli appunti, funzionante sia nel browser sia nell'app.
 *
 * navigator.clipboard richiede un contesto sicuro e non e' affidabile
 * nella WebView di Android: falliva in silenzio, quindi l'utente premeva
 * "copia" e non succedeva nulla senza alcuna spiegazione.
 */
@Injectable({ providedIn: 'root' })
export class ClipboardService {
  private readonly toastController = inject(ToastController);

  /**
   * Restituisce true se la copia e' riuscita.
   * Il chiamante puo' cosi' mostrare una conferma diversa.
   */
  async copia(testo: string, messaggio = 'Copiato negli appunti.'): Promise<boolean> {
    const riuscita = await this.scrivi(testo);

    await this.avvisa(
      riuscita ? messaggio : 'Copia non riuscita: seleziona e copia a mano.',
      riuscita ? 'success' : 'warning'
    );

    return riuscita;
  }

  private async scrivi(testo: string): Promise<boolean> {
    // Nell'app installata il plugin nativo e' l'unica via affidabile
    if (Capacitor.isNativePlatform()) {
      try {
        await Clipboard.write({ string: testo });
        return true;
      } catch {
        return false;
      }
    }

    try {
      await navigator.clipboard.writeText(testo);
      return true;
    } catch {
      return this.ripiego(testo);
    }
  }

  /**
   * Ripiego per i browser senza API appunti o serviti via http:
   * si crea un campo di testo nascosto e si usa il vecchio execCommand.
   */
  private ripiego(testo: string): boolean {
    try {
      const campo = document.createElement('textarea');
      campo.value = testo;
      campo.style.position = 'fixed';
      campo.style.opacity = '0';
      document.body.appendChild(campo);
      campo.select();
      const esito = document.execCommand('copy');
      document.body.removeChild(campo);
      return esito;
    } catch {
      return false;
    }
  }

  private async avvisa(messaggio: string, colore: string): Promise<void> {
    const toast = await this.toastController.create({
      message: messaggio,
      duration: 1800,
      color: colore,
      position: 'bottom',
    });
    await toast.present();
  }
}
