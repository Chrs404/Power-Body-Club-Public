import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

/**
 * Blocca l'accesso agli utenti non autenticati.
 *
 * Sincrono di proposito: il ripristino della sessione dal token avviene
 * in sessionInitializer, prima che il router parta. Se questo guard fosse
 * asincrono, gli altri guard dello stesso array verrebbero valutati in
 * parallelo con l'utente ancora null (vedi commento in session.initializer.ts).
 */
export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  // returnUrl: dopo il login si torna dove si stava andando.
  return router.createUrlTree(['/login'], {
    queryParams: state.url !== '/login' ? { returnUrl: state.url } : undefined,
  });
};
