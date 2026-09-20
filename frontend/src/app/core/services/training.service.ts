import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';
import {
  TrainingSession, SessionHistoryItem, WeightLog, LatestWeight,
  CreateWeightLogRequest,
} from '../models/training.model';

@Injectable({ providedIn: 'root' })
export class TrainingService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE_URL}/training`;

  async currentSession(): Promise<TrainingSession> {
    const res = await firstValueFrom(
      this.http.get<{ session: TrainingSession }>(`${this.base}/session/current`)
    );
    return res.session;
  }

  /**
   * giornoCompletato indica che con questa spunta il giorno e' terminato:
   * il server ha chiuso e archiviato la sessione, e ne ha aperta una nuova.
   */
  async markExercise(
    workoutExerciseId: number
  ): Promise<{ session: TrainingSession; giornoCompletato: boolean }> {
    return firstValueFrom(
      this.http.post<{ session: TrainingSession; giornoCompletato: boolean }>(
        `${this.base}/session/exercises/${workoutExerciseId}`, {}
      )
    );
  }

  async unmarkExercise(workoutExerciseId: number): Promise<TrainingSession> {
    const res = await firstValueFrom(
      this.http.delete<{ session: TrainingSession }>(
        `${this.base}/session/exercises/${workoutExerciseId}`
      )
    );
    return res.session;
  }

  async resetSession(): Promise<{ session: TrainingSession; message: string }> {
    return firstValueFrom(
      this.http.post<{ session: TrainingSession; message: string }>(
        `${this.base}/session/reset`, {}
      )
    );
  }

  async sessionHistory(): Promise<SessionHistoryItem[]> {
    const res = await firstValueFrom(
      this.http.get<{ sessions: SessionHistoryItem[] }>(`${this.base}/session/history`)
    );
    return res.sessions;
  }

  async weightHistory(exerciseId?: number): Promise<WeightLog[]> {
    let params = new HttpParams();
    if (exerciseId) params = params.set('exerciseId', String(exerciseId));
    const res = await firstValueFrom(
      this.http.get<{ logs: WeightLog[] }>(`${this.base}/weights`, { params })
    );
    return res.logs;
  }

  async latestWeights(): Promise<LatestWeight[]> {
    const res = await firstValueFrom(
      this.http.get<{ weights: LatestWeight[] }>(`${this.base}/weights/latest`)
    );
    return res.weights;
  }

  async logWeight(data: CreateWeightLogRequest): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base}/weights`, data));
  }

  async deleteWeightLog(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.base}/weights/${id}`));
  }
}
