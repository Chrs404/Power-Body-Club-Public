import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';
import { RenewalsResponse } from '../models/renewals.model';

@Injectable({ providedIn: 'root' })
export class RenewalsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE_URL}/renewals`;

  /** Abbonamenti e schede in scadenza entro la finestra indicata (default 30 giorni). */
  async list(giorni?: number): Promise<RenewalsResponse> {
    let params = new HttpParams();
    if (giorni) params = params.set('giorni', giorni);

    return firstValueFrom(
      this.http.get<RenewalsResponse>(this.base, { params })
    );
  }
}
