import { Request, Response } from 'express';
import * as exerciseService from '../services/exercise.service';
import { badRequest } from '../utils/app-error';
import { listExercisesQuerySchema } from '../schemas/exercise.schema';

function parseId(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw badRequest('Identificativo non valido.');
  }
  return id;
}

export async function list(req: Request, res: Response): Promise<void> {
  const parsed = listExercisesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw badRequest('Parametri di ricerca non validi.');
  }
  const exercises = await exerciseService.listExercises(parsed.data);
  res.json({ success: true, exercises });
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const exercise = await exerciseService.getExerciseById(parseId(req.params.id));
  res.json({ success: true, exercise });
}

export async function create(req: Request, res: Response): Promise<void> {
  const exercise = await exerciseService.createExercise(req.body);
  res.status(201).json({ success: true, message: 'Esercizio creato.', exercise });
}

export async function update(req: Request, res: Response): Promise<void> {
  const exercise = await exerciseService.updateExercise(parseId(req.params.id), req.body);
  res.json({ success: true, message: 'Esercizio aggiornato.', exercise });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const result = await exerciseService.removeExercise(parseId(req.params.id));
  res.json({
    success: true,
    message: result.deleted
      ? 'Esercizio eliminato.'
      : 'Esercizio disattivato: è usato in schede esistenti e non può essere eliminato.',
    deleted: result.deleted,
  });
}
