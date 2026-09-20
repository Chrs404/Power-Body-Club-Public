import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

/**
 * Impedisce di usare l'app finche' il primo accesso non e' completato.
 * Va applicato a tutte le rotte tranne /login e /primo-accesso.
 */
export const firstAccessGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.mustChangePassword()) {
    return router.createUrlTree(['/primo-accesso']);
  }

  return true;
};

/**
 * Inverso del precedente: protegge la pagina di primo accesso
 * da chi lo ha gia' completato.
 */
export const requiresFirstAccessGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.mustChangePassword()) {
    return router.createUrlTree([auth.homeRoute()]);
  }

  return true;
};
