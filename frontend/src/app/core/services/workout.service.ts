import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

import { API_BASE_URL } from '../config/api.config';
import {
  Workout,
  WorkoutSummary,
  WorkoutStatus,
  WorkoutTemplate,
  CreateWorkoutRequest,
  UpdateWorkoutRequest,
  CreateTemplateRequest,
  AssignTemplateRequest,
} from '../models/workout.model';

@Injectable({ providedIn: 'root' })
export class WorkoutService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE_URL}/workouts`;

  async listForClient(
    userId: number,
    status: WorkoutStatus | 'all' = 'all',
    limit = 10
  ): Promise<WorkoutSummary[]> {
    const params = new HttpParams()
      .set('userId', String(userId))
      .set('status', status)
      .set('limit', String(limit));

    const res = await firstValueFrom(
      this.http.get<{ workouts: WorkoutSummary[] }>(this.base, { params })
    );
    return res.workouts;
  }

  async getById(id: number): Promise<Workout> {
    const res = await firstValueFrom(
      this.http.get<{ workout: Workout }>(`${this.base}/${id}`)
    );
    return res.workout;
  }

  async getMyWorkouts(): Promise<WorkoutSummary[]> {
    const res = await firstValueFrom(
      this.http.get<{ workouts: WorkoutSummary[] }>(`${this.base}/me/list`)
    );
    return res.workouts;
  }

  async getMyActive(): Promise<Workout | null> {
    const res = await firstValueFrom(
      this.http.get<{ workout: Workout | null }>(`${this.base}/me/active`)
    );
    return res.workout;
  }

  async create(data: CreateWorkoutRequest): Promise<Workout> {
    const res = await firstValueFrom(
      this.http.post<{ workout: Workout }>(this.base, data)
    );
    return res.workout;
  }

  async update(id: number, data: UpdateWorkoutRequest): Promise<Workout> {
    const res = await firstValueFrom(
      this.http.patch<{ workout: Workout }>(`${this.base}/${id}`, data)
    );
    return res.workout;
  }

  async archive(id: number): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base}/${id}/archive`, {}));
  }

  async remove(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.base}/${id}`));
  }

  // --- Schede rapide ---

  async listTemplates(): Promise<WorkoutTemplate[]> {
    const res = await firstValueFrom(
      this.http.get<{ templates: WorkoutTemplate[] }>(`${this.base}/modelli`)
    );
    return res.templates;
  }

  async getTemplate(id: number): Promise<Workout> {
    const res = await firstValueFrom(
      this.http.get<{ template: Workout }>(`${this.base}/modelli/${id}`)
    );
    return res.template;
  }

  async createTemplate(data: CreateTemplateRequest): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base}/modelli`, data));
  }

  async updateTemplate(id: number, data: UpdateWorkoutRequest): Promise<void> {
    await firstValueFrom(this.http.patch(`${this.base}/modelli/${id}`, data));
  }

  async deleteTemplate(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.base}/modelli/${id}`));
  }

  /** Crea una copia indipendente di una scheda rapida. */
  async duplicateTemplate(id: number): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base}/modelli/${id}/duplica`, {}));
  }

  /** Scarica una scheda rapida in PDF. */
  async downloadTemplatePdf(id: number, nomeFile: string): Promise<void> {
    const blob = await firstValueFrom(
      this.http.get(`${this.base}/modelli/${id}/pdf`, { responseType: 'blob' })
    );
    await this.salvaPdf(blob, nomeFile);
  }

  async assignTemplate(id: number, data: AssignTemplateRequest): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base}/modelli/${id}/assegna`, data));
  }

  /**
   * Scarica la scheda in PDF.
   *
   * Il file arriva come blob e viene salvato creando un collegamento
   * temporaneo: non si puo' usare un semplice link perche' la richiesta
   * deve portare con se' il token di autenticazione, che l'interceptor
   * aggiunge solo alle chiamate fatte tramite HttpClient.
   */
  /**
   * Scarica la scheda in PDF.
   *
   * Il percorso e' diverso a seconda di dove gira l'app:
   *
   * - nel BROWSER si crea un collegamento temporaneo con l'attributo
   *   download, che il browser interpreta salvando il file;
   *
   * - nell'APP INSTALLATA quell'attributo non ha alcun effetto: la
   *   WebView di Android non ha un gestore di download, quindi il clic
   *   non produceva nulla e senza errori. Il file va scritto sul
   *   dispositivo e poi aperto tramite il menu di condivisione.
   */
  async downloadPdf(id: number, nomeFile: string): Promise<void> {
    const blob = await firstValueFrom(
      this.http.get(`${this.base}/${id}/pdf`, { responseType: 'blob' })
    );

    await this.salvaPdf(blob, nomeFile);
  }

  /**
   * Salva il PDF dove ha senso a seconda del contesto: nell'app
   * installata sul dispositivo, nel browser come download.
   * Condivisa fra schede dei clienti e schede rapide.
   */
  private async salvaPdf(blob: Blob, nomeFile: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await this.salvaSuDispositivo(blob, nomeFile);
      return;
    }

    this.salvaNelBrowser(blob, nomeFile);
  }

  private salvaNelBrowser(blob: Blob, nomeFile: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeFile;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Il collegamento va revocato, altrimenti il file resta in memoria
    // finche' la pagina non viene ricaricata.
    URL.revokeObjectURL(url);
  }

  private async salvaSuDispositivo(blob: Blob, nomeFile: string): Promise<void> {
    const base64 = await this.blobInBase64(blob);

    /*
     * Directory.Cache e non Documents: il file e' rigenerabile in
     * qualsiasi momento dal server, quindi non ha senso occupare
     * spazio permanente. Il sistema puo' liberarlo quando serve.
     */
    const risultato = await Filesystem.writeFile({
      path: nomeFile,
      data: base64,
      directory: Directory.Cache,
    });

    /*
     * Il menu di condivisione lascia scegliere all'utente: aprire con
     * un lettore PDF, salvare fra i file, inviare via messaggio.
     * Aprire direttamente il file richiederebbe un FileProvider
     * configurato a mano nel progetto Android.
     */
    await Share.share({
      title: 'Scheda di allenamento',
      url: risultato.uri,
      dialogTitle: 'Apri o salva la scheda',
    });
  }

  /** FileReader restituisce "data:application/pdf;base64,XXXX": serve solo la parte finale. */
  private blobInBase64(blob: Blob): Promise<string> {
    return new Promise((risolvi, rifiuta) => {
      const lettore = new FileReader();
      lettore.onerror = () => rifiuta(new Error('Lettura del file non riuscita.'));
      lettore.onload = () => {
        const risultato = lettore.result as string;
        risolvi(risultato.split(',')[1] ?? '');
      };
      lettore.readAsDataURL(blob);
    });
  }
}
