import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';
import { TokenService } from './token.service';
import {
  User,
  LoginRequest,
  LoginResponse,
  FirstAccessRequest,
  ChangePasswordRequest,
  ApiResponse,
} from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenService = inject(TokenService);
  private readonly router = inject(Router);

  private readonly currentUser = signal<User | null>(null);

  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly isTrainer = computed(() => this.currentUser()?.role === 'TRAINER');
  readonly isClient = computed(() => this.currentUser()?.role === 'CLIENT');
  readonly mustChangePassword = computed(
    () => this.currentUser()?.mustChangePassword === true
  );

  async login(credentials: LoginRequest): Promise<User> {
    const response = await firstValueFrom(
      this.http.post<LoginResponse>(`${API_BASE_URL}/auth/login`, credentials)
    );

    this.tokenService.setToken(response.token);
    this.applicaUtente(response.user);
    return response.user;
  }

  /**
   * Ricarica l'utente dal token salvato. Usato dal guard all'avvio
   * dell'app, quando lo stato in memoria e' vuoto ma il token esiste.
   * Restituisce false se il token non e' piu' valido.
   */
  /**
   * Ripristina la sessione salvata sul dispositivo.
   *
   * Se c'e' un profilo in copia locale l'app parte SUBITO con quello, e
   * la verifica sul server avviene in secondo piano. E' cio' che evita
   * l'attesa quando il backend e' in pausa: prima si restava fermi sul
   * caricamento finche' non rispondeva.
   */
  async restoreSession(): Promise<boolean> {
    if (!this.tokenService.hasToken()) {
      return false;
    }

    const salvato = this.tokenService.getCachedUser();

    if (salvato) {
      this.currentUser.set(salvato);
      // Non attesa di proposito: l'app e' gia' utilizzabile, e l'esito
      // della verifica arrivera' fra qualche secondo.
      void this.verificaSessione(true);
      return true;
    }

    // Nessuna copia locale (primo accesso dopo l'aggiornamento):
    // in questo caso la verifica va attesa, non c'e' altro da mostrare.
    return this.verificaSessione();
  }

  /** Aggiorna insieme l'utente in memoria e la copia sul dispositivo. */
  private applicaUtente(user: User): void {
    this.currentUser.set(user);
    this.tokenService.setCachedUser(user);
  }

  /**
   * Rilegge il profilo dal server e attende l'esito.
   *
   * Da usare dopo aver modificato i propri dati, quando l'aggiornamento
   * deve essere visibile subito: restoreSession, essendo ottimistica,
   * tornerebbe prima che la risposta sia arrivata.
   */
  async refreshUser(): Promise<boolean> {
    return this.verificaSessione();
  }

  /**
   * Chiede al server chi e' il titolare del token.
   *
   * Il punto delicato e' il trattamento degli errori: prima QUALSIASI
   * errore cancellava il token, quindi bastava che il backend fosse in
   * pausa o la rete assente perche' la sessione venisse buttata via e
   * si dovessero reinserire le credenziali.
   *
   * Ora solo un 401 - l'unica risposta che significa davvero "questo
   * token non vale piu'" - chiude la sessione. Un errore di rete o un
   * 5xx durante il risveglio del server la lasciano intatta.
   */
  private async verificaSessione(inSecondoPiano = false): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.http.get<ApiResponse>(`${API_BASE_URL}/auth/me`)
      );

      if (response.user) {
        this.applicaUtente(response.user);
        return true;
      }
      return false;
    } catch (error: unknown) {
      const stato = (error as { status?: number })?.status;

      if (stato === 401) {
        this.tokenService.clearToken();
        this.currentUser.set(null);

        // Se l'app era gia' stata aperta con il profilo salvato, l'utente
        // sta guardando un'interfaccia che non ha piu' diritto di vedere:
        // va riportato al login subito, senza attendere che sia una
        // chiamata qualsiasi a scoprirlo.
        if (inSecondoPiano) {
          void this.router.navigate(['/login'], { replaceUrl: true });
        }
        return false;
      }

      // Server irraggiungibile, in pausa o in errore: la sessione resta
      // valida. Se il token fosse davvero scaduto, la prima chiamata
      // utile rispondera' 401 e l'interceptor riportera' al login.
      return this.currentUser() !== null;
    }
  }

  async completeFirstAccess(data: FirstAccessRequest): Promise<User> {
    const response = await firstValueFrom(
      this.http.post<ApiResponse>(`${API_BASE_URL}/auth/first-access`, data)
    );

    if (response.user) {
      this.applicaUtente(response.user);
      return response.user;
    }
    throw new Error('Risposta del server non valida.');
  }

  async changePassword(data: ChangePasswordRequest): Promise<void> {
    await firstValueFrom(
      this.http.post<ApiResponse>(`${API_BASE_URL}/auth/change-password`, data)
    );
  }

  logout(): void {
    this.tokenService.clearToken();
    this.currentUser.set(null);
    void this.router.navigate(['/login'], { replaceUrl: true });
  }

  /** Rotta iniziale in base al ruolo e allo stato del primo accesso. */
  homeRoute(): string {
    const user = this.currentUser();
    if (!user) return '/login';
    if (user.mustChangePassword) return '/primo-accesso';
    return user.role === 'TRAINER' ? '/istruttore' : '/cliente';
  }
}
