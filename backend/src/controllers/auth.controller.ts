import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { unauthorized } from '../utils/app-error';
import { LoginInput, FirstAccessInput, ChangePasswordInput } from '../schemas/auth.schema';

export async function login(req: Request, res: Response): Promise<void> {
  const { username, password } = req.body as LoginInput;
  const result = await authService.login(username, password);

  res.json({
    success: true,
    token: result.token,
    user: result.user,
  });
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw unauthorized('Autenticazione richiesta.');
  }

  // Insieme al profilo, un token rinnovato: vedi rinnovaSessione.
  // Le versioni dell'app che non lo leggono continuano a funzionare.
  const { user, token } = await authService.rinnovaSessione(req.user.userId);
  res.json({ success: true, user, token });
}

export async function firstAccess(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw unauthorized('Autenticazione richiesta.');
  }

  const user = await authService.completeFirstAccess(
    req.user.userId,
    req.body as FirstAccessInput
  );

  res.json({
    success: true,
    message: 'Profilo completato correttamente.',
    user,
  });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw unauthorized('Autenticazione richiesta.');
  }

  const { currentPassword, newPassword } = req.body as ChangePasswordInput;
  await authService.changePassword(req.user.userId, currentPassword, newPassword);

  res.json({ success: true, message: 'Password aggiornata correttamente.' });
}
