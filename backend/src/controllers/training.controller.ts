import { Request, Response } from 'express';
import * as sessionService from '../services/session.service';
import * as weightService from '../services/weight.service';
import { badRequest, unauthorized } from '../utils/app-error';
import { weightHistoryQuerySchema } from '../schemas/training.schema';

function parseId(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw badRequest('Identificativo non valido.');
  }
  return id;
}

function requireUser(req: Request): number {
  if (!req.user) {
    throw unauthorized('Autenticazione richiesta.');
  }
  return req.user.userId;
}

export async function currentSession(req: Request, res: Response): Promise<void> {
  const session = await sessionService.getOrCreateCurrentSession(requireUser(req));
  res.json({ success: true, session });
}

export async function markExercise(req: Request, res: Response): Promise<void> {
  const esito = await sessionService.markExercise(
    requireUser(req),
    parseId(req.params.workoutExerciseId)
  );
  res.json({
    success: true,
    session: esito.session,
    // Il client usa questo per avvisare che l'allenamento e' stato salvato
    giornoCompletato: esito.giornoCompletato,
  });
}

export async function unmarkExercise(req: Request, res: Response): Promise<void> {
  const esito = await sessionService.unmarkExercise(
    requireUser(req),
    parseId(req.params.workoutExerciseId)
  );
  res.json({ success: true, session: esito.session, giornoCompletato: false });
}

export async function resetSession(req: Request, res: Response): Promise<void> {
  const result = await sessionService.resetSession(requireUser(req));
  res.json({
    success: true,
    message: result.archived
      ? 'Allenamento archiviato. Puoi ricominciare.'
      : 'Allenamento già pronto.',
    session: result.session,
  });
}

export async function sessionHistory(req: Request, res: Response): Promise<void> {
  const sessions = await sessionService.listSessionHistory(requireUser(req));
  res.json({ success: true, sessions });
}

export async function createWeightLog(req: Request, res: Response): Promise<void> {
  const log = await weightService.createWeightLog(requireUser(req), req.body);
  res.status(201).json({ success: true, message: 'Peso registrato.', log });
}

export async function weightHistory(req: Request, res: Response): Promise<void> {
  const parsed = weightHistoryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw badRequest('Parametri non validi.');
  }
  const logs = await weightService.listWeightLogs(requireUser(req), parsed.data);
  res.json({ success: true, logs });
}

export async function latestWeights(req: Request, res: Response): Promise<void> {
  const weights = await weightService.getLatestWeights(requireUser(req));
  res.json({ success: true, weights });
}

export async function deleteWeightLog(req: Request, res: Response): Promise<void> {
  await weightService.deleteWeightLog(requireUser(req), parseId(req.params.id));
  res.json({ success: true, message: 'Registrazione eliminata.' });
}
