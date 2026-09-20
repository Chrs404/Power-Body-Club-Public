import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { TokenService } from '../services/token.service';

// Rotte il cui 401 e' gestito da chi le chiama, senza redirect automatico:
// - /auth/login: il 401 e' semplicemente "credenziali errate"
// - /auth/me: chiamata dall'initializer, quando il router non e' ancora attivo
const NO_REDIRECT_ON_401 = ['/auth/login', '/auth/me'];

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenService = inject(TokenService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const skipRedirect = NO_REDIRECT_ON_401.some((path) => req.url.includes(path));

      // 401 su una rotta protetta: il token e' scaduto o revocato.
      if (error.status === 401 && !skipRedirect) {
        tokenService.clearToken();
        void router.navigate(['/login'], { replaceUrl: true });
      }

      if (error.status === 0) {
        return throwError(() => ({
          ...error,
          message: 'Impossibile contattare il server. Verifica la connessione.',
        }));
      }

      return throwError(() => error);
    })
  );
};
