import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

/**
 * Ripristina la sessione dal token salvato PRIMA che il router avvii
 * la valutazione dei guard.
 *
 * Perche' non basta farlo dentro authGuard: Angular esegue i guard di uno
 * stesso array canActivate in parallelo (combineLatest + take(1)), non in
 * sequenza. Ogni guard viene valutato una sola volta, al momento della
 * sottoscrizione. Se authGuard e' asincrono, roleGuard viene calcolato
 * mentre l'utente e' ancora null e il suo redirect resta congelato,
 * anche se authGuard poi va a buon fine.
 *
 * Ripristinando qui, quando i guard partono l'utente e' gia' in memoria
 * e tutti i controlli possono restare sincroni.
 */
export function sessionInitializer(): Promise<void> {
  const auth = inject(AuthService);

  return auth
    .restoreSession()
    .then(() => undefined)
    // Un token non valido o il backend irraggiungibile non devono impedire
    // l'avvio dell'app: si finisce semplicemente sul login.
    .catch(() => undefined);
}
