import { Component, inject, signal } from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonContent, IonHeader, IonTitle, IonToolbar, IonList, IonListHeader,
  IonItem, IonLabel, IonInput, IonButton, IonSpinner, IonNote,
  IonBadge,
  AlertController, ToastController,
} from '@ionic/angular/standalone';

import { AuthService } from '../../../core/services/auth.service';
import { UserProfileService } from '../../../core/services/user-profile.service';

@Component({
  selector: 'app-trainer-profile',
  imports: [
    ReactiveFormsModule, UpperCasePipe,
    IonContent, IonHeader, IonTitle, IonToolbar, IonList, IonListHeader,
    IonItem, IonLabel, IonInput, IonButton, IonSpinner, IonNote,
    IonBadge,
  ],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.css',
})
export class TrainerProfilePage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly profileService = inject(UserProfileService);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);

  readonly user = this.auth.user;
  readonly savingProfile = signal(false);
  readonly savingPassword = signal(false);

  readonly profileForm = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    email: [''],
    phone: [''],
  });

  readonly passwordForm = this.fb.nonNullable.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  });

  constructor() {
    const u = this.user();
    this.profileForm.patchValue({
      firstName: u?.firstName ?? '',
      lastName: u?.lastName ?? '',
      email: u?.email ?? '',
      phone: u?.phone ?? '',
    });
  }

  get passwordsMismatch(): boolean {
    const { newPassword, confirmPassword } = this.passwordForm.getRawValue();
    return confirmPassword.length > 0 && newPassword !== confirmPassword;
  }

  async saveProfile(): Promise<void> {
    if (this.profileForm.invalid || this.savingProfile()) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.savingProfile.set(true);
    const v = this.profileForm.getRawValue();

    try {
      await this.profileService.updateProfile({
        firstName: v.firstName,
        lastName: v.lastName,
        email: v.email.trim(),
        phone: v.phone.trim(),
      });
      // Ricarica l'utente in memoria: i dati compaiono in tutta l'app.
      await this.auth.refreshUser();
      await this.showToast('Profilo aggiornato.', 'success');
    } catch (error: unknown) {
      const err = error as { error?: { message?: string } };
      await this.showToast(err?.error?.message ?? 'Salvataggio non riuscito.', 'danger');
    } finally {
      this.savingProfile.set(false);
    }
  }

  async changePassword(): Promise<void> {
    if (this.passwordForm.invalid || this.passwordsMismatch || this.savingPassword()) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    this.savingPassword.set(true);
    const v = this.passwordForm.getRawValue();

    try {
      await this.auth.changePassword({
        currentPassword: v.currentPassword,
        newPassword: v.newPassword,
      });
      this.passwordForm.reset();
      await this.showToast('Password aggiornata.', 'success');
    } catch (error: unknown) {
      const err = error as { error?: { message?: string; fields?: Record<string, string> } };
      const field = err?.error?.fields ? Object.values(err.error.fields)[0] : undefined;
      await this.showToast(
        field ?? err?.error?.message ?? 'Cambio password non riuscito.',
        'danger'
      );
    } finally {
      this.savingPassword.set(false);
    }
  }

  async confirmLogout(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Uscire dall\'app?',
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        { text: 'Esci', role: 'confirm', handler: () => this.auth.logout() },
      ],
    });
    await alert.present();
  }

  private async showToast(message: string, color: string): Promise<void> {
    const toast = await this.toastController.create({
      message, duration: 2500, color, position: 'bottom',
    });
    await toast.present();
  }
}
