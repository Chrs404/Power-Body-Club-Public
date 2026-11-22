import { Component, computed, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  expandOutline, closeOutline, chevronDownOutline, refreshOutline, checkmarkCircle,
} from 'ionicons/icons';

import { PASSO_RECUPERO, RestTimerService } from '../../../core/services/rest-timer.service';

/**
 * Il recupero in corso, in due forme:
 *
 * - barra in basso, sopra il menu: si continua a usare l'app;
 * - schermo intero, leggibile con il telefono appoggiato sulla panca.
 *
 * Entrambe hanno +20 s e −20 s, per adattare il recupero a come ci si
 * sente in quel momento.
 */
@Component({
  selector: 'app-rest-timer-bar',
  imports: [IonIcon],
  templateUrl: './rest-timer-bar.component.html',
  styleUrl: './rest-timer-bar.component.css',
})
export class RestTimerBarComponent {
  readonly timer = inject(RestTimerService);
  readonly passo = PASSO_RECUPERO;

  /** Anello di avanzamento: un conic-gradient che si svuota. */
  readonly anello = computed(
    () => `conic-gradient(var(--pbc-ochre) ${Math.round(this.timer.avanzamento() * 360)}deg, rgba(246, 239, 226, 0.16) 0)`
  );

  readonly larghezzaBarra = computed(() => `${Math.round(this.timer.avanzamento() * 100)}%`);

  constructor() {
    addIcons({ expandOutline, closeOutline, chevronDownOutline, refreshOutline, checkmarkCircle });
  }
}
