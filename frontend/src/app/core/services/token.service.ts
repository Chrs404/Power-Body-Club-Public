import { Injectable } from '@angular/core';
import { User } from '../models/user.model';

const TOKEN_KEY = 'gym_token';
const USER_KEY = 'gym_user';

/**
 * Unico punto di accesso ai dati di sessione salvati sul dispositivo.
 *
 * Oltre al token conserva una copia del profilo: serve a far partire
 * l'app senza attendere il server. Su Render il backend va in pausa
 * dopo 15 minuti di inattività, quindi alla prima apertura la risposta
 * può richiedere una trentina di secondi: senza una copia locale
 * l'utente resterebbe fermo sul caricamento ogni volta.
 *
 * La copia non e' una fonte di verita': serve solo a mostrare subito
 * qualcosa. Il token resta l'unica cosa che il server verifica, e chi
 * modificasse la copia a mano otterrebbe soltanto un'interfaccia
 * sbagliata per qualche istante, finche' la verifica non lo smentisce.
 */
@Injectable({ providedIn: 'root' })
export class TokenService {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  }

  /** Cancella l'intera sessione: token e profilo salvato. */
  clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  hasToken(): boolean {
    return this.getToken() !== null;
  }

  /** Profilo della sessione precedente, se presente e leggibile. */
  getCachedUser(): User | null {
    const grezzo = localStorage.getItem(USER_KEY);
    if (!grezzo) return null;

    try {
      return JSON.parse(grezzo) as User;
    } catch {
      // Dato corrotto: si riparte dalla verifica sul server.
      localStorage.removeItem(USER_KEY);
      return null;
    }
  }

  setCachedUser(user: User): void {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}
