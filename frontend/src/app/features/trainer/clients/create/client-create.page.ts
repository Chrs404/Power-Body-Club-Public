import { Component, inject, signal } from '@angular/core';
import { KeyValuePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent, IonHeader, IonTitle, IonToolbar, IonButton, IonButtons,
  IonBackButton, IonInput, IonItem, IonList, IonListHeader, IonLabel,
  IonSpinner, IonTextarea, IonCard, IonCardContent, IonCardHeader,
  IonCardTitle, IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { copyOutline, checkmarkCircle } from 'ionicons/icons';

import { ClientService } from '../../../../core/services/client.service';
import { ClipboardService } from '../../../../core/services/clipboard.service';
import { GeneratedCredentials } from '../../../../core/models/client.model';

@Component({
  selector: 'app-client-create',
  imports: [
    ReactiveFormsModule,
    KeyValuePipe,
    IonContent, IonHeader, IonTitle, IonToolbar, IonButton, IonButtons,
    IonBackButton, IonInput, IonItem, IonList, IonListHeader, IonLabel,
    IonSpinner, IonTextarea, IonCard, IonCardContent, IonCardHeader,
    IonCardTitle, IonIcon,
  ],
  templateUrl: './client-create.page.html',
  styleUrl: './client-create.page.css',
})
export class ClientCreatePage {
  private readonly fb = inject(FormBuilder);
  private readonly clientService = inject(ClientService);
  private readonly clipboard = inject(ClipboardService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly credentials = signal<GeneratedCredentials | null>(null);
  readonly copied = signal(false);

  readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    email: [''],
    phone: [''],
    birthDate: [''],
    notes: [''],
    subscriptionStart: [this.today()],
    subscriptionEnd: [this.inOneYear()],
    subscriptionPlan: [''],
  });

  constructor() {
    addIcons({ copyOutline, checkmarkCircle });
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private inOneYear(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    this.fieldErrors.set({});

    const v = this.form.getRawValue();

    try {
      const result = await this.clientService.create({
        firstName: v.firstName,
        lastName: v.lastName,
        email: v.email.trim() || undefined,
        phone: v.phone.trim() || undefined,
        birthDate: v.birthDate || undefined,
        notes: v.notes.trim() || undefined,
        subscriptionStart: v.subscriptionStart || undefined,
        subscriptionEnd: v.subscriptionEnd || undefined,
        subscriptionPlan: v.subscriptionPlan.trim() || undefined,
      });

      // Le credenziali si vedono una volta sola: nel database resta
      // solo l'hash della password.
      this.credentials.set(result.credentials);
    } catch (error: unknown) {
      const err = error as { error?: { message?: string; fields?: Record<string, string> } };
      this.fieldErrors.set(err?.error?.fields ?? {});
      this.errorMessage.set(err?.error?.message ?? 'Impossibile creare il cliente.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Copia entrambe le credenziali, pronte da incollare in un messaggio. */
  async copyCredentials(): Promise<void> {
    const c = this.credentials();
    if (!c) return;

    const testo =
      `Power Body Club — le tue credenziali\n` +
      `Username: ${c.username}\n` +
      `Password temporanea: ${c.temporaryPassword}\n\n` +
      `Al primo accesso ti verrà chiesto di scegliere una password personale.`;

    const riuscita = await this.clipboard.copia(testo, 'Credenziali copiate.');
    if (riuscita) {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }

  /**
   * Copia un singolo campo.
   *
   * Serve quando si detta la password a voce o la si incolla in un campo
   * separato: copiare il blocco intero costringerebbe a ripulirlo a mano.
   */
  async copiaCampo(valore: string, etichetta: string): Promise<void> {
    await this.clipboard.copia(valore, `${etichetta} copiato.`);
  }

  goToList(): void {
    void this.router.navigate(['/istruttore/clienti'], { replaceUrl: true });
  }

  createAnother(): void {
    this.credentials.set(null);
    this.form.reset({
      subscriptionStart: this.today(),
      subscriptionEnd: this.inOneYear(),
    });
  }
}
