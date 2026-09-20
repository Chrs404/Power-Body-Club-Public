import { Component, inject, viewChild } from '@angular/core';
import {
  IonApp, IonRouterOutlet, Platform, ToastController,
} from '@ionic/angular/standalone';
import { App as CapacitorApp } from '@capacitor/app';

import { VersionService } from './core/services/version.service';

@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet],
  template: `
    <ion-app>
      @if (versione.aggiornamentoRichiesto()) {
        <!-- Copre l'intera applicazione: con una versione non piu'
             compatibile, proseguire produrrebbe solo errori. -->
        <div class="schermata-aggiornamento">
          <img src="logo.png" alt="" class="logo" />
          <h1>Aggiornamento necessario</h1>
          <p>
            Questa versione dell'app non è più compatibile con il server.
            Installa l'ultima versione per continuare ad allenarti.
          </p>
          @if (versione.urlAggiornamento(); as url) {
            <a class="pulsante" [href]="url" target="_blank" rel="noopener">
              Scarica l'aggiornamento
            </a>
          } @else {
            <p class="nota">Chiedi in palestra come aggiornare l'app.</p>
          }
        </div>
      } @else {
        <ion-router-outlet></ion-router-outlet>
      }
    </ion-app>
  `,
  styles: [`
    .schermata-aggiornamento {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 2rem 1.5rem;
      text-align: center;
      background: var(--ion-background-color);
      color: var(--ion-text-color);
    }
    .logo { width: 96px; height: 96px; border-radius: 50%; margin-bottom: 0.5rem; }
    h1 {
      font-family: var(--pbc-font-display);
      font-size: 1.4rem;
      font-weight: 600;
      margin: 0;
    }
    p { color: var(--ion-color-medium); margin: 0; max-width: 22rem; }
    .nota { font-size: 0.85rem; font-style: italic; }
    .pulsante {
      margin-top: 0.5rem;
      padding: 0.7rem 1.6rem;
      border-radius: 8px;
      background: var(--ion-color-primary);
      color: #fff;
      text-decoration: none;
      font-weight: 600;
    }
  `],
})
export class App {
  private readonly platform = inject(Platform);
  private readonly toastController = inject(ToastController);
  private readonly routerOutlet = viewChild.required(IonRouterOutlet);

  /**
   * Istante dell'ultima pressione su una pagina radice.
   * null anziche' 0: con 0 la prima pressione verrebbe interpretata come
   * "seconda" ogni volta che l'orologio parte da un valore basso.
   */
  private ultimaUscita: number | null = null;

  readonly versione = inject(VersionService);

  constructor() {
    this.gestisciTastoIndietro();

    // Non atteso: l'app parte comunque, la schermata compare solo
    // se il controllo si conclude con esito negativo.
    void this.versione.verifica();
  }

  /**
   * Tasto indietro fisico di Android.
   *
   * Ionic registra da solo un gestore con priorita' 0 che torna alla pagina
   * precedente. Qui serve solo il caso in cui non c'e' piu' nulla a cui
   * tornare: senza un gestore a priorita' inferiore, Android chiuderebbe
   * l'app di colpo.
   *
   * Invece di uscire subito si chiede conferma con una seconda pressione:
   * e' il comportamento a cui gli utenti Android sono abituati ed evita di
   * perdere il lavoro con un tocco involontario, cosa facile mentre si
   * tiene il telefono in mano fra una serie e l'altra.
   */
  private gestisciTastoIndietro(): void {
    this.platform.backButton.subscribeWithPriority(-1, () => {
      if (this.routerOutlet().canGoBack()) {
        return;
      }

      const adesso = Date.now();
      if (this.ultimaUscita !== null && adesso - this.ultimaUscita < 2000) {
        void CapacitorApp.exitApp();
        return;
      }

      this.ultimaUscita = adesso;
      void this.avvisaUscita();
    });
  }

  private async avvisaUscita(): Promise<void> {
    const toast = await this.toastController.create({
      message: 'Premi di nuovo per uscire',
      duration: 1800,
      position: 'bottom',
    });
    await toast.present();
  }
}
