import { Request, Response } from 'express';
import * as userService from '../services/user.service';
import { badRequest, unauthorized } from '../utils/app-error';
import { listClientsQuerySchema } from '../schemas/user.schema';

// Express 5 tipizza i parametri di rotta come string | string[].
function parseId(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw badRequest('Identificativo non valido.');
  }
  return id;
}

export async function listClients(req: Request, res: Response): Promise<void> {
  const parsed = listClientsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw badRequest('Parametri di ricerca non validi.');
  }

  const result = await userService.listClients(parsed.data);
  res.json({ success: true, ...result });
}

export async function getClient(req: Request, res: Response): Promise<void> {
  const client = await userService.getClientById(parseId(req.params.id));
  res.json({ success: true, client });
}

export async function createClient(req: Request, res: Response): Promise<void> {
  const result = await userService.createClient(req.body);
  res.status(201).json({
    success: true,
    message: 'Cliente creato correttamente.',
    client: result.user,
    credentials: result.credentials,
  });
}

export async function updateClient(req: Request, res: Response): Promise<void> {
  const client = await userService.updateClient(parseId(req.params.id), req.body);
  res.json({ success: true, message: 'Cliente aggiornato.', client });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const credentials = await userService.resetClientPassword(parseId(req.params.id));
  res.json({
    success: true,
    message: 'Nuova password temporanea generata.',
    credentials,
  });
}

export async function addSubscription(req: Request, res: Response): Promise<void> {
  const subscription = await userService.addSubscription(parseId(req.params.id), req.body);
  res.status(201).json({
    success: true,
    message: 'Abbonamento registrato.',
    subscription,
  });
}

export async function deleteSubscription(req: Request, res: Response): Promise<void> {
  await userService.deleteSubscription(
    parseId(req.params.id),
    parseId(req.params.subscriptionId)
  );
  res.json({ success: true, message: 'Abbonamento eliminato.' });
}

export async function deletionPreview(req: Request, res: Response): Promise<void> {
  const preview = await userService.getDeletionPreview(parseId(req.params.id));
  res.json({ success: true, ...preview });
}

export async function deleteClient(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw unauthorized('Autenticazione richiesta.');
  }
  await userService.deleteClient(parseId(req.params.id), req.user.userId);
  res.json({ success: true, message: 'Cliente eliminato definitivamente.' });
}

export async function summary(req: Request, res: Response): Promise<void> {
  const data = await userService.getClientsSummary();
  res.json({ success: true, summary: data });
}

export async function updateOwnProfile(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw unauthorized('Autenticazione richiesta.');
  }
  const user = await userService.updateOwnProfile(req.user.userId, req.body);
  res.json({ success: true, message: 'Profilo aggiornato.', user });
}
