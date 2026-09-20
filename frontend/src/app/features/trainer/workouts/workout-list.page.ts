import { Component, inject, signal, viewChild, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  IonContent, IonHeader, IonTitle, IonToolbar, IonButtons, IonBackButton,
  IonButton, IonList, IonItem, IonLabel, IonSpinner, IonIcon, IonBadge,
  IonFab, IonFabButton, IonNote, IonModal, IonInput,
  IonAccordion, IonAccordionGroup,
  AlertController, ToastController,
  IonRefresher, IonRefresherContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  add, createOutline, trashOutline, documentTextOutline, layersOutline,
  downloadOutline, linkOutline,
} from 'ionicons/icons';

import { WorkoutService } from '../../../core/services/workout.service';
import { ClientService } from '../../../core/services/client.service';
import { Workout, WorkoutSummary, WorkoutTemplate } from '../../../core/models/workout.model';

@Component({
  selector: 'app-workout-list',
  imports: [
    DatePipe, FormsModule,
    IonContent, IonHeader, IonTitle, IonToolbar, IonButtons, IonBackButton,
    IonButton, IonList, IonItem, IonLabel, IonSpinner, IonIcon, IonBadge,
    IonFab, IonFabButton, IonNote, IonModal, IonInput,
    IonAccordion, IonAccordionGroup,
    IonRefresher, IonRefresherContent,
  ],
  templateUrl: './workout-list.page.html',
  styleUrl: './workout-list.page.css',
})
export class WorkoutListPage implements OnInit {
  private readonly workoutService = inject(WorkoutService);
  private readonly clientService = inject(ClientService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);

  readonly workouts = signal<WorkoutSummary[]>([]);
  readonly clientName = signal('');
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  clientId = 0;

  // --- Assegnazione da scheda rapida ---
  readonly templates = signal<WorkoutTemplate[]>([]);
  readonly modelliModalOpen = signal(false);

  /** Riferimento al modale, per poterne attendere la chiusura effettiva. */
  private readonly modelliModal = viewChild.required<IonModal>('modelliModal');
  readonly assegnando = signal(false);
  readonly modelloScelto = signal<WorkoutTemplate | null>(null);
  nomeAssegnato = '';
  inizioAssegnato = '';
  fineAssegnato = '';

  constructor() {
    addIcons({
      add, createOutline, trashOutline, documentTextOutline, layersOutline,
      downloadOutline, linkOutline,
    });
  }

  /** Trascinamento verso il basso per aggiornare i dati. */
  async refresh(event: Event): Promise<void> {
    await this.load();
    (event.target as HTMLIonRefresherElement).complete();
  }

  ngOnInit(): void {
    this.clientId = Number(this.route.snapshot.paramMap.get('id'));
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [client, workouts] = await Promise.all([
        this.clientService.getById(this.clientId),
        this.workoutService.listForClient(this.clientId, 'all', 10),
      ]);
      this.clientName.set(
        [client.firstName, client.lastName].filter(Boolean).join(' ') || client.username
      );
      this.workouts.set(workouts);
    } catch (error: unknown) {
      const err = error as { error?: { message?: string } };
      this.errorMessage.set(err?.error?.message ?? 'Impossibile caricare le schede.');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Apre l'elenco dei modelli. Vengono caricati qui e non all'avvio della
   * pagina: la maggior parte delle volte si crea una scheda da zero, e
   * una richiesta in meno all'apertura si nota su rete lenta.
   */
  async apriModelli(): Promise<void> {
    this.modelloScelto.set(null);
    this.modelliModalOpen.set(true);

    if (this.templates().length === 0) {
      try {
        this.templates.set(await this.workoutService.listTemplates());
      } catch {
        await this.showToast('Impossibile caricare le schede rapide.', 'danger');
      }
    }
  }

  /**
   * Secondo passo: si conferma nome e periodo prima di assegnare.
   *
   * L'elenco dei modelli porta solo i conteggi (3 giorni, 25 esercizi):
   * per mostrare il contenuto vero serve una seconda richiesta. Viene
   * fatta qui e non al caricamento dell'elenco, perche' interessa solo
   * il modello effettivamente scelto.
   */
  async scegliModello(template: WorkoutTemplate): Promise<void> {
    const oggi = new Date();
    const fine = new Date();
    fine.setDate(fine.getDate() + 28);

    this.modelloScelto.set(template);
    this.nomeAssegnato = template.name;
    this.inizioAssegnato = oggi.toISOString().slice(0, 10);
    this.fineAssegnato = fine.toISOString().slice(0, 10);

    this.dettaglioModello.set(null);
    this.caricandoDettaglio.set(true);
    try {
      this.dettaglioModello.set(await this.workoutService.getTemplate(template.id));
    } catch {
      // Il dettaglio è un aiuto alla scelta, non un requisito:
      // se fallisce si può comunque assegnare, con i soli conteggi.
      await this.showToast('Impossibile caricare il contenuto della scheda.', 'warning');
    } finally {
      this.caricandoDettaglio.set(false);
    }
  }

  /** Contenuto completo del modello scelto, per l'anteprima. */
  readonly dettaglioModello = signal<Workout | null>(null);
  readonly caricandoDettaglio = signal(false);

  /**
   * Apre il costruttore precompilato con il contenuto del modello,
   * come nuova scheda per questo cliente.
   *
   * È la via per adattare una scheda rapida alla persona — togliere un
   * esercizio, cambiare i carichi — senza modificare il modello
   * originale, che resta disponibile per gli altri clienti.
   */
  async personalizzaPrimaDiAssegnare(): Promise<void> {
    const modello = this.modelloScelto();
    if (!modello) return;

    /*
     * La chiusura viene ATTESA prima di navigare.
     *
     * Impostare solo il segnale a false avvia un'animazione di chiusura
     * di circa 300 ms, mentre la navigazione parte subito: il componente
     * veniva distrutto a meta' animazione e l'overlay restava attaccato
     * alla pagina, sopra il costruttore, senza piu' nessuno in ascolto
     * sul tasto Chiudi. Dipendendo dai tempi, succedeva solo a volte.
     */
    await this.modelliModal().dismiss();

    await this.router.navigate(['/istruttore/schede/nuova', this.clientId], {
      queryParams: { daModello: modello.id },
    });
  }

  totaleEsercizi(template: WorkoutTemplate): number {
    return template.days.reduce((somma, g) => somma + g._count.exercises, 0);
  }

  async confermaAssegnazione(): Promise<void> {
    const modello = this.modelloScelto();
    if (!modello || this.assegnando()) return;

    if (this.nomeAssegnato.trim().length < 2) {
      await this.showToast('Il nome deve contenere almeno 2 caratteri.', 'warning');
      return;
    }

    this.assegnando.set(true);
    try {
      await this.workoutService.assignTemplate(modello.id, {
        userId: this.clientId,
        name: this.nomeAssegnato.trim(),
        startDate: this.inizioAssegnato || undefined,
        endDate: this.fineAssegnato || undefined,
      });
      this.modelliModalOpen.set(false);
      await this.showToast('Scheda assegnata.', 'success');
      await this.load();
    } catch (error: unknown) {
      const err = error as { error?: { message?: string; fields?: Record<string, string> } };
      const campo = err?.error?.fields ? Object.values(err.error.fields)[0] : undefined;
      await this.showToast(
        campo ?? err?.error?.message ?? 'Assegnazione non riuscita.',
        'danger'
      );
    } finally {
      this.assegnando.set(false);
    }
  }

  readonly scaricando = signal<number | null>(null);

  /** Scarica la scheda in PDF, nel formato del protocollo cartaceo. */
  async scaricaPdf(workout: WorkoutSummary): Promise<void> {
    if (this.scaricando() !== null) return;
    this.scaricando.set(workout.id);

    const nome = this.clientName().replace(/[^a-zA-Z0-9]/g, '_');
    const data = workout.startDate.slice(0, 10).split('-').reverse().join('-');

    try {
      await this.workoutService.downloadPdf(workout.id, `${nome}_${data}.pdf`);
    } catch {
      await this.showToast('Impossibile generare il PDF.', 'danger');
    } finally {
      this.scaricando.set(null);
    }
  }

  createNew(): void {
    void this.router.navigate(['/istruttore/schede/nuova', this.clientId]);
  }

  edit(workout: WorkoutSummary): void {
    void this.router.navigate(['/istruttore/schede', workout.id, 'modifica']);
  }

  async confirmDelete(workout: WorkoutSummary): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Eliminare la scheda?',
      message: `"${workout.name}" e tutti i dati collegati verranno eliminati definitivamente.`,
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Elimina',
          role: 'destructive',
          handler: () => void this.remove(workout.id),
        },
      ],
    });
    await alert.present();
  }

  private async remove(id: number): Promise<void> {
    try {
      await this.workoutService.remove(id);
      await this.showToast('Scheda eliminata.', 'success');
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
