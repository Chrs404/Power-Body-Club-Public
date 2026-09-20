import { Component, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonContent, IonIcon, IonButton,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { logoAndroid, globeOutline, downloadOutline } from 'ionicons/icons';

/**
 * Pagina di download dell'app.
 *
 * Non e' raggiungibile da alcun menu: si arriva solo con il link
 * diretto, che l'istruttore consegna ai clienti. Vive dentro l'app
 * invece che come sito separato, cosi' c'e' un solo indirizzo da
 * ricordare e da mantenere.
 */
@Component({
  selector: 'app-download',
  imports: [RouterLink, IonContent, IonIcon, IonButton],
  templateUrl: './download.page.html',
  styleUrl: './download.page.css',
})
export class DownloadPage implements OnInit {
  /** File servito dalla cartella public. */
  private static readonly FILE_APK = 'app.apk';

  readonly dimensione = signal<string | null>(null);
  readonly apk = DownloadPage.FILE_APK;

  constructor() {
    addIcons({ logoAndroid, globeOutline, downloadOutline });
  }

  ngOnInit(): void {
    void this.leggiDimensione();
  }

  /**
   * Mostra quanto pesa il file prima del download.
   * Su rete mobile e' un'informazione che conta.
   */
  private async leggiDimensione(): Promise<void> {
    try {
      const risposta = await fetch(DownloadPage.FILE_APK, { method: 'HEAD' });

      // File assente: la richiesta risponde 404 con lunghezza zero,
      // e annunciare "0.0 MB" sarebbe peggio che tacere.
      if (!risposta.ok) return;

      const byte = Number(risposta.headers.get('content-length'));
      if (byte > 1024) {
        this.dimensione.set(`${(byte / 1024 / 1024).toFixed(1)} MB`);
      }
    } catch {
      // Dimensione non disponibile: il pulsante resta senza indicazione.
    }
  }
}
