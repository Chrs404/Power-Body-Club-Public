import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonContent, IonHeader, IonTitle, IonToolbar, IonList, IonItem, IonLabel,
  IonSpinner, IonIcon, IonNote, IonButton, IonFab, IonFabButton,
  AlertController, ToastController,
  IonRefresher, IonRefresherContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  add, createOutline, trashOutline, copyOutline, layersOutline,
  downloadOutline,
} from 'ionicons/icons';

import { WorkoutService } from '../../../core/services/workout.service';
import { WorkoutTemplate } from '../../../core/models/workout.model';

/**
 * Schede rapide: modelli costruiti una volta e assegnabili a piu' clienti.
 *
 * L'assegnazione avviene dalla scheda del cliente, non da qui: e' li' che
 * l'istruttore si trova quando decide cosa dare a quella persona.
 */
@Component({
  selector: 'app-template-list',
  imports: [
    IonContent, IonHeader, IonTitle, IonToolbar, IonList, IonItem, IonLabel,
    IonSpinner, IonIcon, IonNote, IonButton, IonFab, IonFabButton,
    IonRefresher, IonRefresherContent,
  ],
  templateUrl: './template-list.page.html',
  styleUrl: './template-list.page.css',
})
export class TemplateListPage implements OnInit {
  private readonly workoutService = inject(WorkoutService);
  private readonly router = inject(Router);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);

  readonly templates = signal<WorkoutTemplate[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    addIcons({
      add, createOutline, trashOutline, copyOutline, layersOutline,
      downloadOutline,
    });
  }

  /** Trascinamento verso il basso per aggiornare i dati. */
  async refresh(event: Event): Promise<void> {
    await this.load();
    (event.target as HTMLIonRefresherElement).complete();
  }

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.templates.set(await this.workoutService.listTemplates());
    } catch (error: unknown) {
      const err = error as { error?: { message?: string } };
      this.errorMessage.set(
        err?.error?.message ?? 'Impossibile caricare le schede rapide.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  /** Totale esercizi, utile per capire a colpo d'occhio la consistenza. */
  totaleEsercizi(template: WorkoutTemplate): number {
    return template.days.reduce((somma, g) => somma + g._count.exercises, 0);
  }

  creaNuova(): void {
    void this.router.navigate(['/istruttore/schede-rapide/nuova']);
  }

  readonly scaricando = signal<number | null>(null);

  /** Scarica la scheda rapida in PDF, nel formato del protocollo cartaceo. */
  async scaricaPdf(template: WorkoutTemplate): Promise<void> {
    if (this.scaricando() !== null) return;
    this.scaricando.set(template.id);

    const nome = template.name.trim().replace(/[^a-zA-Z0-9]+/g, '_') || 'scheda_rapida';

    try {
      await this.workoutService.downloadTemplatePdf(template.id, `${nome}.pdf`);
    } catch {
      await this.showToast('Impossibile generare il PDF.', 'danger');
    } finally {
      this.scaricando.set(null);
    }
  }

  readonly duplicando = signal<number | null>(null);

  /**
   * Duplica un modello. Utile per partire da una scheda esistente e
   * variarla — un "push-pull-legs 4 giorni" da quello a 3 — senza
   * doverla ricostruire né rischiare di alterare l'originale.
   */
  async duplica(template: WorkoutTemplate): Promise<void> {
    if (this.duplicando() !== null) return;
    this.duplicando.set(template.id);

    try {
      await this.workoutService.duplicateTemplate(template.id);
      await this.showToast(`"${template.name}" duplicata.`, 'success');
      await this.load();
    } catch {
      await this.showToast('Duplicazione non riuscita.', 'danger');
    } finally {
      this.duplicando.set(null);
    }
  }

  modifica(template: WorkoutTemplate): void {
    void this.router.navigate(['/istruttore/schede-rapide', template.id, 'modifica']);
  }

  async confermaEliminazione(template: WorkoutTemplate): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Eliminare la scheda rapida?',
      message:
        `"${template.name}" verrà eliminata. Le schede gia' assegnate ai ` +
        'clienti non vengono toccate: sono copie indipendenti.',
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Elimina',
          role: 'destructive',
          handler: () => void this.elimina(template.id),
        },
      ],
    });
    await alert.present();
  }

  private async elimina(id: number): Promise<void> {
    try {
      await this.workoutService.deleteTemplate(id);
      await this.showToast('Scheda rapida eliminata.', 'success');
      await this.load();
    } catch {
      await this.showToast('Eliminazione non riuscita.', 'danger');
    }
  }

  private async showToast(message: string, color: string): Promise<void> {
    const toast = await this.toastController.create({
      message, duration: 2500, color, position: 'bottom',
    });
    await toast.present();
  }
}
