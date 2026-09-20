import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';
import {
  Client,
  ClientDetail,
  ClientListResponse,
  ClientFilters,
  ClientsSummary,
  CreateClientRequest,
  UpdateClientRequest,
  CreateSubscriptionRequest,
  GeneratedCredentials,
} from '../models/client.model';

@Injectable({ providedIn: 'root' })
export class ClientService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE_URL}/users`;

  list(filters: ClientFilters = {}): Promise<ClientListResponse> {
    let params = new HttpParams();
    if (filters.search) params = params.set('search', filters.search);
    if (filters.status && filters.status !== 'all') {
      params = params.set('status', filters.status);
    }
    if (filters.expiring) params = params.set('expiring', String(filters.expiring));
    if (filters.page) params = params.set('page', String(filters.page));
    if (filters.pageSize) params = params.set('pageSize', String(filters.pageSize));

    return firstValueFrom(this.http.get<ClientListResponse>(this.base, { params }));
  }

  async summary(): Promise<ClientsSummary> {
    const res = await firstValueFrom(
      this.http.get<{ summary: ClientsSummary }>(`${this.base}/summary`)
    );
    return res.summary;
  }

  async getById(id: number): Promise<ClientDetail> {
    const res = await firstValueFrom(
      this.http.get<{ client: ClientDetail }>(`${this.base}/${id}`)
    );
    return res.client;
  }

  async create(
    data: CreateClientRequest
  ): Promise<{ client: Client; credentials: GeneratedCredentials }> {
    return firstValueFrom(
      this.http.post<{ client: Client; credentials: GeneratedCredentials }>(
        this.base,
        data
      )
    );
  }

  async update(id: number, data: UpdateClientRequest): Promise<Client> {
    const res = await firstValueFrom(
      this.http.patch<{ client: Client }>(`${this.base}/${id}`, data)
    );
    return res.client;
  }

  async resetPassword(id: number): Promise<GeneratedCredentials> {
    const res = await firstValueFrom(
      this.http.post<{ credentials: GeneratedCredentials }>(
        `${this.base}/${id}/reset-password`,
        {}
      )
    );
    return res.credentials;
  }

  async addSubscription(id: number, data: CreateSubscriptionRequest): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base}/${id}/subscriptions`, data));
  }

  async deleteSubscription(id: number, subscriptionId: number): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.base}/${id}/subscriptions/${subscriptionId}`)
    );
  }

  /** Riepilogo di cosa verrebbe eliminato insieme al cliente. */
  async deletionPreview(id: number): Promise<{
    schede: number;
    sessioni: number;
    pesi: number;
    abbonamenti: number;
  }> {
    return firstValueFrom(
      this.http.get<{
        schede: number;
        sessioni: number;
        pesi: number;
        abbonamenti: number;
      }>(`${this.base}/${id}/deletion-preview`)
    );
  }

  async delete(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.base}/${id}`));
  }
}
