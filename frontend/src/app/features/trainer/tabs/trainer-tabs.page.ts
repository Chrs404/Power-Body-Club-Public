import { Component } from '@angular/core';
import {
  IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';

import { SwipeTabsDirective } from '../../../shared/directives/swipe-tabs.directive';
import {
  homeOutline, peopleOutline, barbellOutline, businessOutline, personOutline,
} from 'ionicons/icons';

/**
 * Contenitore a schede dell'area istruttore, speculare a quello del cliente.
 *
 * Le cinque voci sono le sezioni usate quotidianamente. "Orari e chiusure"
 * resta raggiungibile dalla Home: si modifica poche volte l'anno e non
 * merita uno dei cinque posti disponibili.
 */
@Component({
  selector: 'app-trainer-tabs',
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, SwipeTabsDirective],
  template: `
    <ion-tabs [appSwipeTabs]="['home', 'clienti', 'esercizi', 'palestra', 'profilo']">
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="home">
          <ion-icon name="home-outline"></ion-icon>
          <ion-label>Home</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="clienti">
          <ion-icon name="people-outline"></ion-icon>
          <ion-label>Clienti</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="esercizi">
          <ion-icon name="barbell-outline"></ion-icon>
          <ion-label>Esercizi</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="palestra">
          <ion-icon name="business-outline"></ion-icon>
          <ion-label>Palestra</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="profilo">
          <ion-icon name="person-outline"></ion-icon>
          <ion-label>Profilo</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  `,
})
export class TrainerTabsPage {
  constructor() {
    addIcons({
      homeOutline, peopleOutline, barbellOutline, businessOutline, personOutline,
    });
  }
}
