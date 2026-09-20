import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import {
  IonContent, IonHeader, IonTitle, IonToolbar, IonButtons, IonButton,
  IonSegment, IonSegmentButton, IonLabel, IonList, IonItem, IonSpinner,
  IonIcon, IonBadge, IonNote, IonModal, IonInput, IonTextarea, IonToggle,
  IonFab, IonFabButton,
  AlertController, ToastController,
  IonRefresher, IonRefresherContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  add, createOutline, trashOutline, megaphoneOutline, saveOutline,
  closeCircleOutline, calendarOutline,
} from 'ionicons/icons';

import { GymService } from '../../../core/services/gym.service';
import {
  News, Closure, DaySchedule, WeekDay, WEEK_DAY_LABELS,
} from '../../../core/models/gym.model';

const WEEK_ORDER: WeekDay[] = [
  'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY',
];

type Sezione = 'news' | 'orari' | 'chiusure';

/**
 * Gestione della palestra: comunicazioni, orari e chiusure in un'unica
 * pagina a sezioni, speculare a quella che vede il cliente.
 *
 * Prima erano due schermate separate, e gli orari erano raggiungibili
 * solo dalla Home: una destinazione nascosta per una funzione che
 * l'istruttore cerca dove si aspetta di trovarla.
 */
@Component({
  selector: 'app-trainer-gym',
  imports: [
    DatePipe, ReactiveFormsModule, FormsModule,
    IonContent, IonHeader, IonTitle, IonToolbar, IonButtons, IonButton,
    IonSegment, IonSegmentButton, IonLabel, IonList, IonItem, IonSpinner,
    IonIcon, IonBadge, IonNote, IonModal, IonInput, IonTextarea, IonToggle,
    IonFab, IonFabButton,
    IonRefresher, IonRefresherContent,
  ],
  templateUrl: './trainer-gym.page.html',
  styleUrl: './trainer-gym.page.css',
})
export class TrainerGymPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly gymService = inject(GymService);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);

  readonly sezione = signal<Sezione>('news');
  readonly loading = signal(true);
  readonly saving = signal(false);

  // --- Comunicazioni ---
  readonly news = signal<News[]>([]);
  readonly newsModalOpen = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly newsForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    content: ['', [Validators.required, Validators.minLength(5)]],
    imageUrl: [''],
    isPublished: [true],
  });

  // --- Orari e chiusure ---
  readonly schedule = signal<DaySchedule[]>([]);
  readonly closures = signal<Closure[]>([]);
  readonly closureModalOpen = signal(false);
  closureStart = '';
  closureEnd = '';
  closureReason = '';

  readonly dayLabels = WEEK_DAY_LABELS;
  readonly weekOrder = WEEK_ORDER;

  constructor() {
    addIcons({
      add, createOutline, trashOutline, megaphoneOutline, saveOutline,
      closeCircleOutline, calendarOutline,
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
    try {
      const [news, schedule, closures] = await Promise.all([
        this.gymService.allNews(),
        this.gymService.schedule(),
        this.gymService.allClosures(),
      ]);
      this.news.set(news);
      this.schedule.set(schedule);
      this.closures.set(closures);
    } catch {
      await this.showToast('Impossibile caricare i dati.', 'danger');
    } finally {
      this.loading.set(false);
    }
  }

  onSezioneChange(valore: string | number | undefined): void {
    this.sezione.set((valore as Sezione) ?? 'news');
  }

  // ------------------------------------------------------- comunicazioni

  openCreateNews(): void {
    this.editingId.set(null);
    this.errorMessage.set(null);
    this.newsForm.reset({ isPublished: true });
    this.newsModalOpen.set(true);
  }

  openEditNews(item: News): void {
    this.editingId.set(item.id);
    this.errorMessage.set(null);
    this.newsForm.reset({
      title: item.title,
      content: item.content,
      imageUrl: item.imageUrl ?? '',
      isPublished: item.isPublished ?? true,
    });
    this.newsModalOpen.set(true);
  }

  async saveNews(): Promise<void> {
    if (this.newsForm.invalid || this.saving()) {
      this.newsForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    const v = this.newsForm.getRawValue();
    const payload = {
      title: v.title,
      content: v.content,
      imageUrl: v.imageUrl.trim() || undefined,
      isPublished: v.isPublished,
    };

    try {
      const id = this.editingId();
      if (id) {
        await this.gymService.updateNews(id, payload);
      } else {
        await this.gymService.createNews(payload);
      }
      this.newsModalOpen.set(false);
      await this.showToast(
        id ? 'Comunicazione aggiornata.' : 'Comunicazione pubblicata.',
        'success'
      );
      await this.load();
    } catch (error: unknown) {
      const err = error as { error?: { message?: string; fields?: Record<string, string> } };
      const campo = err?.error?.fields ? Object.values(err.error.fields)[0] : undefined;
      this.errorMessage.set(campo ?? err?.error?.message ?? 'Salvataggio non riuscito.');
    } finally {
      this.saving.set(false);
    }
  }

  async confirmDeleteNews(item: News): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Eliminare la comunicazione?',
      message: `"${item.title}" verrà eliminata definitivamente.`,
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        { text: 'Elimina', role: 'destructive', handler: () => void this.removeNews(item.id) },
      ],
    });
    await alert.present();
  }

  private async removeNews(id: number): Promise<void> {
    try {
      await this.gymService.deleteNews(id);
      await this.showToast('Comunicazione eliminata.', 'success');
      await this.load();
    } catch {
      await this.showToast('Eliminazione non riuscita.', 'danger');
    }
  }

  // -------------------------------------------------------------- orari

  isOpen(day: DaySchedule): boolean {
    return day.slots.length > 0;
  }

  /** Un giorno senza fasce e' chiuso: la spunta aggiunge o rimuove la fascia. */
  toggleDay(index: number, open: boolean): void {
    const copy = this.schedule().map((d) => ({ ...d, slots: [...d.slots] }));
    copy[index].slots = open ? [{ openTime: '09:00', closeTime: '21:00' }] : [];
    this.schedule.set(copy);
  }

  addSlot(index: number): void {
    const copy = this.schedule().map((d) => ({ ...d, slots: [...d.slots] }));
    if (copy[index].slots.length >= 3) return;
    copy[index].slots.push({ openTime: '16:00', closeTime: '22:00' });
    this.schedule.set(copy);
  }

  removeSlot(dayIndex: number, slotIndex: number): void {
    const copy = this.schedule().map((d) => ({ ...d, slots: [...d.slots] }));
    copy[dayIndex].slots.splice(slotIndex, 1);
    this.schedule.set(copy);
  }

  updateSlot(
    dayIndex: number,
    slotIndex: number,
    field: 'openTime' | 'closeTime',
    value: string
  ): void {
    const copy = this.schedule().map((d) => ({ ...d, slots: [...d.slots] }));
    copy[dayIndex].slots[slotIndex] = {
      ...copy[dayIndex].slots[slotIndex],
      [field]: value,
    };
    this.schedule.set(copy);
  }

  async saveSchedule(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);

    try {
      const result = await this.gymService.saveSchedule({
        days: this.schedule().map((d) => ({ dayOfWeek: d.dayOfWeek, slots: d.slots })),
      });
      this.schedule.set(result);
      await this.showToast('Orari aggiornati.', 'success');
    } catch (error: unknown) {
      const err = error as { error?: { message?: string; fields?: Record<string, string> } };
      const campo = err?.error?.fields ? Object.values(err.error.fields)[0] : undefined;
      await this.showToast(campo ?? err?.error?.message ?? 'Salvataggio non riuscito.', 'danger');
    } finally {
      this.saving.set(false);
    }
  }

  // ----------------------------------------------------------- chiusure

  openClosureModal(): void {
    const oggi = new Date().toISOString().slice(0, 10);
    this.closureStart = oggi;
    this.closureEnd = oggi;
    this.closureReason = '';
    this.closureModalOpen.set(true);
  }

  async saveClosure(): Promise<void> {
    if (!this.closureReason.trim()) {
      await this.showToast('Indica il motivo della chiusura.', 'warning');
      return;
    }

    try {
      await this.gymService.createClosure({
        startDate: this.closureStart,
        endDate: this.closureEnd,
        reason: this.closureReason.trim(),
      });
      this.closureModalOpen.set(false);
      await this.showToast('Chiusura registrata.', 'success');
      await this.load();
    } catch (error: unknown) {
      const err = error as { error?: { message?: string; fields?: Record<string, string> } };
      const campo = err?.error?.fields ? Object.values(err.error.fields)[0] : undefined;
      await this.showToast(campo ?? err?.error?.message ?? 'Operazione non riuscita.', 'danger');
    }
  }

  async confirmDeleteClosure(closure: Closure): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Eliminare la chiusura?',
      message: `"${closure.reason}" verrà rimossa.`,
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Elimina',
          role: 'destructive',
          handler: () => void this.removeClosure(closure.id),
        },
      ],
    });
    await alert.present();
  }

  private async removeClosure(id: number): Promise<void> {
    try {
      await this.gymService.deleteClosure(id);
      await this.showToast('Chiusura eliminata.', 'success');
      await this.load();
    } catch {
      await this.showToast('Eliminazione non riuscita.', 'danger');
    }
  }

  private async showToast(message: string, color: string): Promise<void> {
    const toast = await this.toastController.create({
      message, duration: 2600, color, position: 'bottom',
    });
    await toast.present();
  }
}
