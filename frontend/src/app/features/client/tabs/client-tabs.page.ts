import { Component } from '@angular/core';
import {
  IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';

import { SwipeTabsDirective } from '../../../shared/directives/swipe-tabs.directive';
import {
  homeOutline, barbellOutline, timeOutline, businessOutline, personOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-client-tabs',
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, SwipeTabsDirective],
  template: `
    <ion-tabs [appSwipeTabs]="['home', 'scheda', 'storico', 'palestra', 'profilo']">
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="home">
          <ion-icon name="home-outline"></ion-icon>
          <ion-label>Home</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="scheda">
          <ion-icon name="barbell-outline"></ion-icon>
          <ion-label>Scheda</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="storico">
          <ion-icon name="time-outline"></ion-icon>
          <ion-label>Storico</ion-label>
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
export class ClientTabsPage {
  constructor() {
    addIcons({
      homeOutline, barbellOutline, timeOutline, businessOutline, personOutline,
    });
  }
}
