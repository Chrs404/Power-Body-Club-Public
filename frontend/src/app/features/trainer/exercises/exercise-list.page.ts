import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import {
  IonContent, IonHeader, IonTitle, IonToolbar, IonButtons,
  IonButton, IonSearchbar, IonList, IonItem, IonLabel, IonSpinner, IonIcon,
  IonFab, IonFabButton, IonModal, IonInput, IonTextarea, IonSelect,
  IonSelectOption, IonBadge, IonAccordion, IonAccordionGroup,
  AlertController, ToastController,
  IonRefresher, IonRefresherContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { add, createOutline, trashOutline, videocamOutline, barbellOutline } from 'ionicons/icons';

import { ExerciseService } from '../../../core/services/exercise.service';
import {
  Exercise, ExerciseInput, MuscleGroup, MUSCLE_GROUPS, MUSCLE_GROUP_LABELS,
} from '../../../core/models/exercise.model';
import { MuscleGroupPipe } from '../../../shared/pipes/muscle-group.pipe';

@Component({
  selector: 'app-exercise-list',
  imports: [
    ReactiveFormsModule, FormsModule, MuscleGroupPipe,
    IonContent, IonHeader, IonTitle, IonToolbar, IonButtons,
    IonButton, IonSearchbar, IonList, IonItem, IonLabel, IonSpinner, IonIcon,
    IonFab, IonFabButton, IonModal, IonInput, IonTextarea, IonSelect,
    IonSelectOption, IonBadge, IonAccordion, IonAccordionGroup,
    IonRefresher, IonRefresherContent,
  ],
  templateUrl: './exercise-list.page.html',
  styleUrl: './exercise-list.page.css',
})
export class ExerciseListPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly exerciseService = inject(ExerciseService);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);

  readonly exercises = signal<Exercise[]>([]);
  readonly loading = signal(true);
  readonly modalOpen = signal(false);
  readonly saving = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly errorMessage = signal<string | null>(null);
  /**
   * Gruppo attualmente aperto. Viene mantenuto durante le operazioni:
   * dopo aver modificato un esercizio la sezione resta espansa,
   * invece di richiudersi costringendo a ritrovare il punto.
   */
  readonly gruppoAperto = signal<MuscleGroup | null>(null);

  readonly muscleGroups = MUSCLE_GROUPS;
  readonly groupLabels = MUSCLE_GROUP_LABELS;

  searchTerm = '';
  private searchTimer?: ReturnType<typeof setTimeout>;

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    muscleGroup: ['CHEST' as MuscleGroup, Validators.required],
    description: [''],
    videoUrl: [''],
    imageUrl: [''],
  });

  constructor() {
    addIcons({ add, createOutline, trashOutline, videocamOutline, barbellOutline });
  }

  /** Trascinamento verso il basso per aggiornare i dati. */
  async refresh(event: Event): Promise<void> {
    await this.load();
    (event.target as HTMLIonRefresherElement).complete();
  }

  ngOnInit(): void {
    void this.load();
  }

  /** Raggruppa per gruppo muscolare, preservando l'ordine del server. */
  readonly grouped = signal<{ group: MuscleGroup; items: Exercise[] }[]>([]);

  private regroup(items: Exercise[]): void {
    const map = new Map<MuscleGroup, Exercise[]>();
    for (const ex of items) {
      const list = map.get(ex.muscleGroup) ?? [];
      list.push(ex);
      map.set(ex.muscleGroup, list);
    }

    // Ordine fisso dei gruppi, lo stesso usato nel selettore del
    // costruttore schede: due schermate che elencano le stesse cose
    // in ordine diverso costringono a ricercare ogni volta.
    this.grouped.set(
      MUSCLE_GROUPS
        .filter((group) => map.has(group))
        .map((group) => ({ group, items: map.get(group)! }))
    );
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const items = await this.exerciseService.list({
        search: this.searchTerm.trim() || undefined,
      });
      this.exercises.set(items);
      this.regroup(items);

      // Cercando, il gruppo dei risultati viene aperto da solo:
      // altrimenti si otterrebbero sezioni chiuse con un conteggio
      // e nessun modo di capire cosa e' stato trovato.
      if (this.searchTerm.trim() && this.grouped().length > 0) {
        this.gruppoAperto.set(this.grouped()[0].group);
      }
    } catch (error: unknown) {
      const err = error as { error?: { message?: string } };
      this.errorMessage.set(err?.error?.message ?? 'Impossibile caricare gli esercizi.');
    } finally {
      this.loading.set(false);
    }
  }

  onSearchChange(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.load(), 350);
  }

  onGruppoChange(valore: string | string[] | null | undefined): void {
    const v = Array.isArray(valore) ? valore[0] : valore;
    this.gruppoAperto.set((v as MuscleGroup) ?? null);
  }

  openCreate(): void {
    this.editingId.set(null);
    this.errorMessage.set(null);
    this.form.reset({ muscleGroup: 'CHEST' });
    this.modalOpen.set(true);
  }

  openEdit(exercise: Exercise): void {
    this.editingId.set(exercise.id);
    this.errorMessage.set(null);
    this.form.reset({
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      description: exercise.description ?? '',
      videoUrl: exercise.videoUrl ?? '',
      imageUrl: exercise.imageUrl ?? '',
    });
    this.modalOpen.set(true);
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);

    const v = this.form.getRawValue();
    const payload: ExerciseInput = {
      name: v.name,
      muscleGroup: v.muscleGroup,
      description: v.description.trim() || undefined,
      videoUrl: v.videoUrl.trim() || undefined,
      imageUrl: v.imageUrl.trim() || undefined,
    };

    try {
      const id = this.editingId();
      if (id) {
        await this.exerciseService.update(id, payload);
      } else {
        await this.exerciseService.create(payload);
      }
      this.modalOpen.set(false);
      await this.showToast(id ? 'Esercizio aggiornato.' : 'Esercizio creato.', 'success');
      await this.load();
    } catch (error: unknown) {
      const err = error as { error?: { message?: string } };
      this.errorMessage.set(err?.error?.message ?? 'Salvataggio non riuscito.');
    } finally {
      this.saving.set(false);
    }
  }

  async confirmRemove(exercise: Exercise): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Eliminare l\'esercizio?',
      message: `"${exercise.name}" verrà rimosso dal catalogo. Se è già usato in qualche scheda verrà solo disattivato.`,
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Elimina',
          role: 'destructive',
          handler: () => void this.remove(exercise.id),
        },
      ],
    });
    await alert.present();
  }

  private async remove(id: number): Promise<void> {
    try {
      const result = await this.exerciseService.remove(id);
      await this.showToast(result.message, result.deleted ? 'success' : 'warning');
      await this.load();
    } catch {
      await this.showToast('Eliminazione non riuscita.', 'danger');
    }
  }

  private async showToast(message: string, color: string): Promise<void> {
    const toast = await this.toastController.create({
      message, duration: 2800, color, position: 'bottom',
    });
    await toast.present();
  }
}
