import {
  Component, EventEmitter, Input, OnChanges, Output, inject, signal, OnInit,
} from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  IonContent, IonHeader, IonTitle, IonToolbar, IonButtons, IonBackButton,
  IonButton, IonInput, IonItem, IonList, IonSpinner,
  IonTextarea, IonToggle, IonModal, IonIcon,
  AlertController, ToastController,
  IonRefresher, IonRefresherContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  keyOutline, addCircleOutline, trashOutline, documentTextOutline,
  personRemoveOutline, timeOutline, bookmarkOutline, chevronDownOutline, chevronUpOutline,
} from 'ionicons/icons';

import { WorkoutService } from '../../../../core/services/workout.service';
import { WorkoutSummary } from '../../../../core/models/workout.model';

import { ClientService } from '../../../../core/services/client.service';
import {
  ClientDetail,
  GeneratedCredentials,
  SubscriptionInfo,
} from '../../../../core/models/client.model';

@Component({
  selector: 'app-client-detail',
  imports: [
    ReactiveFormsModule, DatePipe, RouterLink, NgTemplateOutlet,
    IonContent, IonHeader, IonTitle, IonToolbar, IonButtons, IonBackButton,
    IonButton, IonInput, IonItem, IonList, IonSpinner,
    IonTextarea, IonToggle, IonModal, IonIcon,
    IonRefresher, IonRefresherContent,
  ],
  templateUrl: './client-detail.page.html',
  styleUrl: './client-detail.page.css',
})
export class ClientDetailPage implements OnInit, OnChanges {
  /**
   * Cliente da mostrare quando la pagina e' incorporata nell'elenco
   * (computer, due colonne). Come pagina a se' l'id arriva dall'indirizzo.
   */
  @Input() clientId?: number;
  /** Senza intestazione ne' area di scorrimento propria: sta dentro un'altra pagina. */
  @Input() incorporato = false;
  /** Avvisa l'elenco che qualcosa e' cambiato (rinnovo, eliminazione...). */
  @Output() readonly cambiato = new EventEmitter<void>();

  private readonly workoutService = inject(WorkoutService);
  private readonly fb = inject(FormBuilder);
  private readonly clientService = inject(ClientService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);

  readonly client = signal<ClientDetail | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly newCredentials = signal<GeneratedCredentials | null>(null);
  readonly subscriptionModalOpen = signal(false);

  /** Eliminazione automatica: null se il cliente non rischia nulla. */
  readonly eliminazione = signal<{ deleteOn: string; daysLeft: number } | null>(null);
  readonly schedaAttiva = signal<WorkoutSummary | null>(null);
  readonly schedePrecedenti = signal<WorkoutSummary[]>([]);
  readonly storicoAperto = signal(false);
  readonly datiAperti = signal(false);
  readonly operazione = signal(false);

  private id = 0;

  readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    email: [''],
    phone: [''],
    birthDate: [''],
    notes: [''],
    isActive: [true],
  });

  readonly subscriptionForm = this.fb.nonNullable.group({
    startDate: ['', Validators.required],
    endDate: ['', Validators.required],
    plan: [''],
  });

  constructor() {
    addIcons({
      keyOutline, addCircleOutline, trashOutline, documentTextOutline,
      personRemoveOutline, timeOutline, bookmarkOutline, chevronDownOutline, chevronUpOutline,
    });
  }

  /** Trascinamento verso il basso per aggiornare i dati. */
  async refresh(event: Event): Promise<void> {
    await this.load();
    (event.target as HTMLIonRefresherElement).complete();
  }

  ngOnInit(): void {
    if (this.clientId === undefined) {
      this.id = Number(this.route.snapshot.paramMap.get('id'));
      void this.load().then(() => {
        // "Rinnova" dalla Home apre subito il nuovo abbonamento.
        if (this.route.snapshot.queryParamMap.get('rinnova') && this.client()) {
          this.openSubscriptionModal();
        }
      });
    }
  }

  // ngOnInit ha già caricato i dati: al primo ingresso non serve rifarlo.
  private primoIngresso = true;

  /**
   * Tornando qui dal costruttore (nuova scheda, modifica) Ionic riusa la
   * pagina gia' aperta senza ricrearla: senza ricaricare, la scheda attiva
   * mostrata sarebbe ancora quella di prima.
   */
  ionViewWillEnter(): void {
    if (this.primoIngresso || this.incorporato) {
      this.primoIngresso = false;
      return;
    }
    void this.load();
  }

  ngOnChanges(): void {
    // Incorporata: si ricarica ogni volta che nell'elenco si sceglie un altro cliente.
    if (this.clientId !== undefined && this.clientId !== this.id) {
      this.id = this.clientId;
      this.newCredentials.set(null);
      this.storicoAperto.set(false);
      this.datiAperti.set(false);
      this.errorMessage.set(null);
      void this.load();
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [{ client, deletion }, attive, archiviate] = await Promise.all([
        this.clientService.getDetail(this.id),
        this.workoutService.listForClient(this.id, 'ACTIVE', 1),
        this.workoutService.listForClient(this.id, 'ARCHIVED', 5),
      ]);
      this.client.set(client);
      this.eliminazione.set(deletion);
      this.schedaAttiva.set(attive[0] ?? null);
      this.schedePrecedenti.set(archiviate);
      this.form.patchValue({
        firstName: client.firstName ?? '',
        lastName: client.lastName ?? '',
        email: client.email ?? '',
        phone: client.phone ?? '',
        birthDate: client.birthDate ? client.birthDate.slice(0, 10) : '',
        notes: client.notes ?? '',
        isActive: client.isActive,
      });
    } catch (error: unknown) {
      const err = error as { error?: { message?: string } };
      this.errorMessage.set(err?.error?.message ?? 'Cliente non trovato.');
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const v = this.form.getRawValue();

    try {
      await this.clientService.update(this.id, {
        firstName: v.firstName,
        lastName: v.lastName,
        email: v.email.trim(),
        phone: v.phone.trim(),
        birthDate: v.birthDate || '',
        notes: v.notes.trim(),
        isActive: v.isActive,
      });
      await this.showToast('Modifiche salvate.', 'success');
      await this.load();
      this.cambiato.emit();
    } catch (error: unknown) {
      const err = error as { error?: { message?: string } };
      await this.showToast(err?.error?.message ?? 'Salvataggio non riuscito.', 'danger');
    } finally {
      this.saving.set(false);
    }
  }

  async confirmResetPassword(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Reimpostare la password?',
      message:
        'Verrà generata una nuova password temporanea. Quella attuale smetterà subito di funzionare.',
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        { text: 'Reimposta', role: 'confirm', handler: () => void this.resetPassword() },
      ],
    });
    await alert.present();
  }

  private async resetPassword(): Promise<void> {
    try {
      this.newCredentials.set(await this.clientService.resetPassword(this.id));
      await this.load();
    } catch {
      await this.showToast('Impossibile reimpostare la password.', 'danger');
    }
  }

  openSubscriptionModal(): void {
    const today = new Date();
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);

    this.subscriptionForm.reset({
      startDate: today.toISOString().slice(0, 10),
      endDate: nextYear.toISOString().slice(0, 10),
      plan: '',
    });
    this.subscriptionModalOpen.set(true);
  }

  async saveSubscription(): Promise<void> {
    if (this.subscriptionForm.invalid) {
      this.subscriptionForm.markAllAsTouched();
      return;
    }

    const v = this.subscriptionForm.getRawValue();
    try {
      await this.clientService.addSubscription(this.id, {
        startDate: v.startDate,
        endDate: v.endDate,
        plan: v.plan.trim() || undefined,
      });
      this.subscriptionModalOpen.set(false);
      await this.showToast('Abbonamento registrato.', 'success');
      await this.load();
      this.cambiato.emit();
    } catch (error: unknown) {
      const err = error as { error?: { message?: string } };
      await this.showToast(err?.error?.message ?? 'Operazione non riuscita.', 'danger');
    }
  }

  async confirmDeleteSubscription(subscription: SubscriptionInfo): Promise<void> {
    if (!subscription.id) return;

    // La formattazione avviene qui: Angular non ammette pipe
    // dentro le espressioni di evento nei template.
    const from = this.formatDate(subscription.startDate);
    const to = this.formatDate(subscription.endDate);
    const label = subscription.plan || 'Abbonamento';

    const alert = await this.alertController.create({
      header: 'Eliminare l\'abbonamento?',
      message: `${label} (${from} — ${to}) verrà eliminato definitivamente. L'operazione non può essere annullata.`,
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Elimina',
          role: 'destructive',
          handler: () => void this.deleteSubscription(subscription.id!),
        },
      ],
    });
    await alert.present();
  }

  private formatDate(value: string): string {
    const d = new Date(value);
    return d.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  private async deleteSubscription(subscriptionId: number): Promise<void> {
    try {
      await this.clientService.deleteSubscription(this.id, subscriptionId);
      await this.showToast('Abbonamento eliminato.', 'success');
      await this.load();
      this.cambiato.emit();
    } catch (error: unknown) {
      const err = error as { error?: { message?: string } };
      await this.showToast(
        err?.error?.message ?? 'Eliminazione non riuscita.',
        'danger'
      );
    }
  }

  /**
   * Eliminazione definitiva del cliente.
   *
   * Richiede due conferme: la prima mostra numeri concreti su cosa
   * andrebbe perso, la seconda chiede di digitare il cognome.
   * Non e' eccesso di zelo: l'operazione cancella a cascata abbonamenti,
   * schede, allenamenti svolti e storico pesi, senza possibilita' di
   * recupero. La disattivazione conserva tutto ed e' quasi sempre
   * la scelta giusta.
   */
  async confermaEliminazione(): Promise<void> {
    const c = this.client();
    if (!c) return;

    let riepilogo: { schede: number; sessioni: number; pesi: number; abbonamenti: number };
    try {
      riepilogo = await this.clientService.deletionPreview(this.id);
    } catch {
      await this.showToast('Impossibile verificare i dati del cliente.', 'danger');
      return;
    }

    const voci: string[] = [];
    if (riepilogo.schede > 0) voci.push(`${riepilogo.schede} schede`);
    if (riepilogo.sessioni > 0) voci.push(`${riepilogo.sessioni} allenamenti svolti`);
    if (riepilogo.pesi > 0) voci.push(`${riepilogo.pesi} pesi registrati`);
    if (riepilogo.abbonamenti > 0) voci.push(`${riepilogo.abbonamenti} abbonamenti`);

    const elenco = voci.length > 0
      ? `Verranno eliminati anche: ${voci.join(', ')}.`
      : 'Il cliente non ha ancora dati collegati.';

    const alert = await this.alertController.create({
      header: 'Eliminare definitivamente?',
      message:
        `${elenco} L'operazione non puo' essere annullata. ` +
        'Se vuoi solo impedire l\'accesso, disattiva l\'account invece di eliminarlo.',
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Continua',
          role: 'destructive',
          handler: () => void this.chiediConferma(c.lastName ?? c.username),
        },
      ],
    });
    await alert.present();
  }

  /** Seconda conferma: digitare il cognome evita l'eliminazione per errore. */
  private async chiediConferma(atteso: string): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Conferma finale',
      message: `Scrivi "${atteso}" per confermare l'eliminazione.`,
      inputs: [{ name: 'conferma', type: 'text', placeholder: atteso }],
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Elimina',
          role: 'destructive',
          handler: (dati: { conferma?: string }) => {
            if (dati.conferma?.trim().toLowerCase() !== atteso.toLowerCase()) {
              void this.showToast('Testo non corrispondente. Eliminazione annullata.', 'warning');
              return true;
            }
            void this.elimina();
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async elimina(): Promise<void> {
    try {
      await this.clientService.delete(this.id);
      await this.showToast('Cliente eliminato definitivamente.', 'success');
      if (this.incorporato) {
        this.client.set(null);
        this.cambiato.emit();
      } else {
        await this.router.navigate(['/istruttore/clienti'], { replaceUrl: true });
      }
    } catch (error: unknown) {
      const err = error as { error?: { message?: string } };
      await this.showToast(err?.error?.message ?? 'Eliminazione non riuscita.', 'danger');
    }
  }

  // ------------------------------------------------- eliminazione automatica

  quandoEliminazione(giorni: number): string {
    if (giorni <= 0) return 'alla prossima pulizia';
    if (giorni === 1) return 'domani';
    return `fra ${giorni} giorni`;
  }

  async rimandaEliminazione(): Promise<void> {
    if (this.operazione()) return;
    this.operazione.set(true);
    try {
      await this.clientService.postponeDeletion(this.id);
      await this.showToast('Eliminazione rimandata di 15 giorni.', 'success');
      await this.load();
      this.cambiato.emit();
    } catch {
      await this.showToast('Operazione non riuscita.', 'danger');
    } finally {
      this.operazione.set(false);
    }
  }

  // ------------------------------------------------------------- schede

  /** Giorni a una data "YYYY-MM-DD"; negativo se gia' passata. */
  giorniA(data: string | null): number | null {
    if (!data) return null;
    const fine = Date.UTC(+data.slice(0, 4), +data.slice(5, 7) - 1, +data.slice(8, 10));
    const ora = new Date();
    return Math.round((fine - Date.UTC(ora.getFullYear(), ora.getMonth(), ora.getDate())) / 86_400_000);
  }

  tono(giorni: number | null): 'ok' | 'warn' | 'bad' | '' {
    if (giorni === null) return '';
    if (giorni < 0) return 'bad';
    if (giorni <= 7) return 'warn';
    return 'ok';
  }

  scadenza(giorni: number | null, femminile = false): string {
    if (giorni === null) return 'Senza scadenza';
    if (giorni < 0) {
      return `Scadut${femminile ? 'a' : 'o'} da ${-giorni} ${-giorni === 1 ? 'giorno' : 'giorni'}`;
    }
    if (giorni === 0) return 'Scade oggi';
    if (giorni === 1) return 'Scade domani';
    return `${giorni} giorni`;
  }

  /** Copia la scheda attiva fra le schede rapide, chiedendo il nome. */
  async salvaComeRapida(): Promise<void> {
    const scheda = this.schedaAttiva();
    if (!scheda) return;

    const alert = await this.alertController.create({
      header: 'Salva come scheda rapida',
      message: 'La scheda del cliente resta com\'è: ne viene salvata una copia da riassegnare ad altri.',
      inputs: [{ name: 'nome', type: 'text', value: scheda.name, placeholder: 'Nome della scheda rapida' }],
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Salva',
          role: 'confirm',
          handler: (dati: { nome?: string }) => {
            void this.eseguiSalvataggioRapida(scheda.id, dati.nome?.trim() || scheda.name);
          },
        },
      ],
    });
    await alert.present();
  }

  private async eseguiSalvataggioRapida(workoutId: number, nome: string): Promise<void> {
    try {
      await this.workoutService.saveAsTemplate(workoutId, nome);
      await this.showToast(`"${nome}" salvata fra le schede rapide.`, 'success');
    } catch (error: unknown) {
      const err = error as { error?: { message?: string } };
      await this.showToast(err?.error?.message ?? 'Salvataggio non riuscito.', 'danger');
    }
  }

  private async showToast(message: string, color: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 2500,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}
