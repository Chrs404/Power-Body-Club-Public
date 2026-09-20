import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { unauthorized } from '../utils/app-error';

/**
 * Legge il token dall'header "Authorization: Bearer <token>"
 * e popola req.user. Blocca la richiesta se il token manca o non e' valido.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    throw unauthorized('Autenticazione richiesta.');
  }

  const token = header.substring(7).trim();

  if (!token) {
    throw unauthorized('Autenticazione richiesta.');
  }

  req.user = verifyToken(token);
  next();
}
