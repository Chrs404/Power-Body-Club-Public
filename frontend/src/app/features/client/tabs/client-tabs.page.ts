import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  homeOutline, barbellOutline, statsChartOutline, businessOutline, personCircleOutline,
} from 'ionicons/icons';

import { SwipeTabsDirective } from '../../../shared/directives/swipe-tabs.directive';
import { RestTimerBarComponent } from '../../../shared/components/rest-timer-bar/rest-timer-bar.component';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Guscio delle pagine del cliente.
 *
 * - Telefono: barra a 4 voci in basso. Il profilo non ha piu' una voce
 *   propria: si apre dal tondo con le iniziali, in alto nella pagina Oggi.
 * - Computer: menu laterale al posto della barra (vedi layout.css).
 * - In entrambi: la barra del timer di recupero, sopra il menu, visibile
 *   da qualunque pagina finche' il recupero e' in corso.
 */
@Component({
  selector: 'app-client-tabs',
  imports: [
    IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, RouterLink, RouterLinkActive,
    SwipeTabsDirective, RestTimerBarComponent,
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
            <a [routerLink]="['/cliente', voce.tab]" routerLinkActive="attivo">
              <ion-icon [name]="voce.icona" aria-hidden="true"></ion-icon>
              <span>{{ voce.etichetta }}</span>
            </a>
          }
        </nav>
        <div class="piede">
          <a routerLink="/cliente/profilo" routerLinkActive="attivo">
            <ion-icon name="person-circle-outline" aria-hidden="true"></ion-icon>
            <span>{{ nome() }}</span>
          </a>
        </div>
      </aside>

      <app-rest-timer-bar slot="bottom"></app-rest-timer-bar>

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
export class ClientTabsPage {
  private readonly auth = inject(AuthService);

  readonly voci = [
    { tab: 'home', etichetta: 'Oggi', icona: 'home-outline' },
    { tab: 'scheda', etichetta: 'Scheda', icona: 'barbell-outline' },
    { tab: 'progressi', etichetta: 'Progressi', icona: 'stats-chart-outline' },
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
      homeOutline, barbellOutline, statsChartOutline, businessOutline, personCircleOutline,
    });
  }
}
