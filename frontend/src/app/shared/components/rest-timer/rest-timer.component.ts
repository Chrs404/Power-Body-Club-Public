import { Component, Input, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { timerOutline } from 'ionicons/icons';

import { RestTimerService } from '../../../core/services/rest-timer.service';

/**
 * Pulsante che avvia il recupero.
 *
 * Il conteggio non sta qui ma in RestTimerService, unico per tutta
 * l'app: cosi' il recupero continua mentre si cambia pagina, e lo si
 * vede nella barra in basso (RestTimerBarComponent).
 */
@Component({
  selector: 'app-rest-timer',
  imports: [IonIcon],
  template: `
    <button
      type="button"
      class="pbc-btn"
      [class.primary]="evidente"
      [class.small]="!evidente"
      [attr.aria-label]="'Avvia il recupero di ' + seconds + ' secondi'"
      (click)="avvia($event)"
    >
      <ion-icon name="timer-outline" aria-hidden="true"></ion-icon>
      <span>{{ evidente ? 'Recupero ' + seconds + ' s' : seconds + ' s' }}</span>
    </button>
  `,
  styles: [`:host { display: contents; }`],
})
export class RestTimerComponent {
  @Input({ required: true }) seconds = 60;
  @Input() exerciseName = '';
  /** Pulsante pieno con testo esteso, invece di quello compatto. */
  @Input() evidente = false;

  private readonly timer = inject(RestTimerService);

  constructor() {
    addIcons({ timerOutline });
  }

  avvia(evento: Event): void {
    // Il pulsante puo' stare dentro una riga cliccabile: il tocco non
    // deve anche aprire o chiudere l'esercizio.
    evento.stopPropagation();
    this.timer.avvia(this.seconds, this.exerciseName);
  }
}
