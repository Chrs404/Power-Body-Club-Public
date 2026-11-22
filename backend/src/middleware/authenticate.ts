import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma/client';
import { verifyToken } from '../utils/jwt';
import { unauthorized } from '../utils/app-error';

/**
 * Legge il token dall'header "Authorization: Bearer <token>"
 * e popola req.user. Blocca la richiesta se il token manca o non e' valido.
 *
 * La firma da sola non basta: un token resta formalmente valido fino alla
 * scadenza anche se nel frattempo l'account e' stato disattivato o
 * eliminato, o se la password e' stata cambiata proprio perche' qualcun
 * altro la conosceva. Per questo a ogni richiesta si rilegge l'utente dal
 * database: costa una lettura per chiave primaria, e rende la revoca
 * immediata invece che rimandata di settimane.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    throw unauthorized('Autenticazione richiesta.');
  }

  const token = header.substring(7).trim();

  if (!token) {
    throw unauthorized('Autenticazione richiesta.');
  }

  const payload = verifyToken(token);

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      username: true,
      role: true,
      isActive: true,
      passwordChangedAt: true,
    },
  });

  if (!user || !user.isActive) {
    throw unauthorized('Sessione non più valida. Effettua di nuovo il login.');
  }

  // Token emesso prima dell'ultimo cambio password: non vale piu'.
  // iat e' in secondi, la data in millisecondi: si confronta al secondo.
  if (
    user.passwordChangedAt &&
    payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)
  ) {
    throw unauthorized('Sessione non più valida. Effettua di nuovo il login.');
  }

  // Dati presi dal database e non dal token: un cambio di username o di
  // ruolo vale da subito, senza attendere il rinnovo del token.
  req.user = { userId: user.id, username: user.username, role: user.role };
  next();
}
