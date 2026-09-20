import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';
import {
  ClientDashboard, Closure, ClosureInput, DaySchedule, News, NewsInput,
  ScheduleInput,
} from '../models/gym.model';

@Injectable({ providedIn: 'root' })
export class GymService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE_URL}/gym`;

  dashboard(): Promise<ClientDashboard> {
    return firstValueFrom(this.http.get<ClientDashboard>(`${this.base}/dashboard`));
  }

  async schedule(): Promise<DaySchedule[]> {
    const res = await firstValueFrom(
      this.http.get<{ schedule: DaySchedule[] }>(`${this.base}/schedule`)
    );
    return res.schedule;
  }

  async closures(): Promise<Closure[]> {
    const res = await firstValueFrom(
      this.http.get<{ closures: Closure[] }>(`${this.base}/closures`)
    );
    return res.closures;
  }

  async news(): Promise<News[]> {
    const res = await firstValueFrom(
      this.http.get<{ news: News[] }>(`${this.base}/news`)
    );
    return res.news;
  }

  // --- Gestione (solo istruttore) ---

  async allNews(): Promise<News[]> {
    const res = await firstValueFrom(
      this.http.get<{ news: News[] }>(`${this.base}/manage/news`)
    );
    return res.news;
  }

  async createNews(data: NewsInput): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base}/manage/news`, data));
  }

  async updateNews(id: number, data: Partial<NewsInput>): Promise<void> {
    await firstValueFrom(this.http.patch(`${this.base}/manage/news/${id}`, data));
  }

  async deleteNews(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.base}/manage/news/${id}`));
  }

  async saveSchedule(data: ScheduleInput): Promise<DaySchedule[]> {
    const res = await firstValueFrom(
      this.http.put<{ schedule: DaySchedule[] }>(`${this.base}/manage/schedule`, data)
    );
    return res.schedule;
  }

  async allClosures(): Promise<Closure[]> {
    const res = await firstValueFrom(
      this.http.get<{ closures: Closure[] }>(`${this.base}/manage/closures`)
    );
    return res.closures;
  }

  async createClosure(data: ClosureInput): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base}/manage/closures`, data));
  }

  async deleteClosure(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.base}/manage/closures/${id}`));
  }
}
