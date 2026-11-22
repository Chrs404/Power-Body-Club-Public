import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  homeOutline, peopleOutline, layersOutline, barbellOutline, businessOutline,
  personCircleOutline,
} from 'ionicons/icons';

import { SwipeTabsDirective } from '../../../shared/directives/swipe-tabs.directive';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Guscio delle pagine dell'istruttore, speculare a quello del cliente.
 *
 * Le schede rapide hanno una voce propria nel menu: prima si
 * raggiungevano solo dalla Home. Il profilo, che si apre di rado, passa
 * al tondo in alto nella Home (e in fondo al menu laterale sul computer).
 */
@Component({
  selector: 'app-trainer-tabs',
  imports: [
    IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, RouterLink, RouterLinkActive,
    SwipeTabsDirective,
  ],
  template: `
    <ion-tabs class="pbc-tabs" [appSwipeTabs]="schede">
      <aside class="pbc-sidebar" slot="top">
        <div class="brand">
          <img src="logo-small.png" alt="" />
          <span>Power Body Club</span>
        </div>
        <nav aria-label="Sezioni">
          @for (voce of voci; track voce.tab) {
            <a [routerLink]="['/istruttore', voce.tab]" routerLinkActive="attivo">
              <ion-icon [name]="voce.icona" aria-hidden="true"></ion-icon>
              <span>{{ voce.etichettaLunga ?? voce.etichetta }}</span>
            </a>
          }
        </nav>
        <div class="piede">
          <a routerLink="/istruttore/profilo" routerLinkActive="attivo">
            <ion-icon name="person-circle-outline" aria-hidden="true"></ion-icon>
            <span>{{ nome() }}</span>
          </a>
        </div>
      </aside>

      <ion-tab-bar slot="bottom">
        @for (voce of voci; track voce.tab) {
          <ion-tab-button [tab]="voce.tab">
            <ion-icon [name]="voce.icona"></ion-icon>
            <ion-label>{{ voce.etichetta }}</ion-label>
          </ion-tab-button>
        }
      </ion-tab-bar>
    </ion-tabs>
  `,
})
export class TrainerTabsPage {
  private readonly auth = inject(AuthService);

  readonly voci: { tab: string; etichetta: string; etichettaLunga?: string; icona: string }[] = [
    { tab: 'home', etichetta: 'Home', icona: 'home-outline' },
    { tab: 'clienti', etichetta: 'Clienti', icona: 'people-outline' },
    { tab: 'schede-rapide', etichetta: 'Schede', etichettaLunga: 'Schede rapide', icona: 'layers-outline' },
    { tab: 'esercizi', etichetta: 'Esercizi', icona: 'barbell-outline' },
    { tab: 'palestra', etichetta: 'Palestra', icona: 'business-outline' },
  ];

  /** Percorsi per lo scorrimento laterale fra le schede, nell'ordine della barra. */
  readonly schede = this.voci.map((v) => v.tab);

  readonly nome = computed(() => {
    const u = this.auth.user();
    return [u?.firstName, u?.lastName].filter(Boolean).join(' ') || u?.username || 'Profilo';
  });

  constructor() {
    addIcons({
      homeOutline, peopleOutline, layersOutline, barbellOutline, businessOutline,
      personCircleOutline,
    });
  }
}
