import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';
import { Exercise, ExerciseInput, MuscleGroup } from '../models/exercise.model';

@Injectable({ providedIn: 'root' })
export class ExerciseService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE_URL}/exercises`;

  async list(filters: {
    search?: string;
    muscleGroup?: MuscleGroup;
    includeInactive?: boolean;
  } = {}): Promise<Exercise[]> {
    let params = new HttpParams();
    if (filters.search) params = params.set('search', filters.search);
    if (filters.muscleGroup) params = params.set('muscleGroup', filters.muscleGroup);
    if (filters.includeInactive) params = params.set('includeInactive', 'true');

    const res = await firstValueFrom(
      this.http.get<{ exercises: Exercise[] }>(this.base, { params })
    );
    return res.exercises;
  }

  async create(data: ExerciseInput): Promise<Exercise> {
    const res = await firstValueFrom(
      this.http.post<{ exercise: Exercise }>(this.base, data)
    );
    return res.exercise;
  }

  async update(id: number, data: Partial<ExerciseInput>): Promise<Exercise> {
    const res = await firstValueFrom(
      this.http.patch<{ exercise: Exercise }>(`${this.base}/${id}`, data)
    );
    return res.exercise;
  }

  async remove(id: number): Promise<{ deleted: boolean; message: string }> {
    return firstValueFrom(
      this.http.delete<{ deleted: boolean; message: string }>(`${this.base}/${id}`)
    );
  }
}
