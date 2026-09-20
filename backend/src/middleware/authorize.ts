import { Request, Response, NextFunction } from 'express';
import { forbidden, unauthorized } from '../utils/app-error';

type Role = 'CLIENT' | 'TRAINER';

/**
 * Da usare sempre DOPO authenticate.
 * Esempio: router.get('/clienti', authenticate, authorize('TRAINER'), handler)
 */
export function authorize(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw unauthorized('Autenticazione richiesta.');
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw forbidden('Non hai i permessi per accedere a questa risorsa.');
    }

    next();
  };
}
