import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { Role } from '../models/user.model';

/**
 * Da usare dopo authGuard.
 * Esempio: canActivate: [authGuard, roleGuard('TRAINER')]
 */
export function roleGuard(...allowedRoles: Role[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const user = auth.user();

    if (!user) {
      return router.createUrlTree(['/login']);
    }

    if (!allowedRoles.includes(user.role)) {
      return router.createUrlTree([auth.homeRoute()]);
    }

    return true;
  };
}
