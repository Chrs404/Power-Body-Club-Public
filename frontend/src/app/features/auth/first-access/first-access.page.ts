import { Component, inject, signal, computed } from '@angular/core';
import { KeyValuePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent, IonHeader, IonTitle, IonToolbar, IonButton, IonInput,
  IonItem, IonList, IonListHeader, IonLabel, IonNote, IonSpinner,
} from '@ionic/angular/standalone';

import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-first-access',
  imports: [
    ReactiveFormsModule, KeyValuePipe,
    IonContent, IonHeader, IonTitle, IonToolbar, IonButton, IonInput,
    IonItem, IonList, IonListHeader, IonLabel, IonNote, IonSpinner,
  ],
  templateUrl: './first-access.page.html',
  styleUrl: './first-access.page.css',
})
export class FirstAccessPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});

  /**
   * Nome e cognome vengono chiesti solo se mancanti.
   * Di norma l'istruttore li ha gia' registrati alla creazione del cliente:
   * richiederli di nuovo sarebbe attrito inutile al primo accesso.
   */
  readonly needsName = computed(() => {
    const u = this.user();
    return !u?.firstName || !u?.lastName;
  });

  readonly displayName = computed(() => {
    const u = this.user();
    return [u?.firstName, u?.lastName].filter(Boolean).join(' ');
  });

  readonly form = this.fb.nonNullable.group({
    firstName: [''],
    lastName: [''],
    email: [''],
    phone: [''],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]],
  });

  constructor() {
    const u = this.user();
    this.form.patchValue({
      firstName: u?.firstName ?? '',
      lastName: u?.lastName ?? '',
      email: u?.email ?? '',
      phone: u?.phone ?? '',
    });

    if (this.needsName()) {
      this.form.controls.firstName.addValidators([
        Validators.required,
        Validators.minLength(2),
      ]);
      this.form.controls.lastName.addValidators([
        Validators.required,
        Validators.minLength(2),
      ]);
      this.form.controls.firstName.updateValueAndValidity();
      this.form.controls.lastName.updateValueAndValidity();
    }
  }

  get passwordsMismatch(): boolean {
    const { newPassword, confirmPassword } = this.form.getRawValue();
    return confirmPassword.length > 0 && newPassword !== confirmPassword;
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.passwordsMismatch || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    this.fieldErrors.set({});

    const v = this.form.getRawValue();

    try {
      await this.auth.completeFirstAccess({
        newPassword: v.newPassword,
        ...(this.needsName()
          ? { firstName: v.firstName, lastName: v.lastName }
          : {}),
        email: v.email.trim(),
        phone: v.phone.trim(),
      });
      await this.router.navigate([this.auth.homeRoute()], { replaceUrl: true });
    } catch (error: unknown) {
      const err = error as {
        error?: { message?: string; fields?: Record<string, string> };
      };
      this.fieldErrors.set(err?.error?.fields ?? {});
      this.errorMessage.set(
        err?.error?.message ?? 'Impossibile completare l\'attivazione. Riprova.'
      );
    } finally {
      this.loading.set(false);
    }
  }
}
