import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

/** Aggiornamento del proprio profilo, valido per entrambi i ruoli. */
@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private readonly http = inject(HttpClient);

  async updateProfile(data: UpdateProfileRequest): Promise<void> {
    await firstValueFrom(this.http.patch(`${API_BASE_URL}/users/me`, data));
  }
}
