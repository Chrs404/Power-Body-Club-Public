import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

/**
 * Protegge la pagina di login da chi ha gia' una sessione valida.
 *
 * L'app parte sempre dall'indirizzo radice, che rimanda a /login: senza
 * questo guard chi aveva gia' fatto l'accesso si ritrovava comunque
 * davanti al modulo di login a ogni apertura, pur avendo il token
 * salvato sul telefono. Era questo a far sembrare che la sessione non
 * venisse ricordata.
 *
 * Sincrono come gli altri guard: la sessione e' gia' stata ripristinata
 * da sessionInitializer prima che il router parta.
 */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    // homeRoute() porta alla pagina giusta per ruolo, oppure al primo
    // accesso se la password temporanea non e' ancora stata cambiata.
    return router.createUrlTree([auth.homeRoute()]);
  }

  return true;
};
