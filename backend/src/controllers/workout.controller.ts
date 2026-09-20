import { Request, Response } from 'express';
import * as workoutService from '../services/workout.service';
import { generaPdfScheda, SchedaPdf } from '../pdf/workout-pdf';
import { badRequest, unauthorized, forbidden } from '../utils/app-error';
import { listWorkoutsQuerySchema } from '../schemas/workout.schema';

function parseId(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw badRequest('Identificativo non valido.');
  }
  return id;
}

export async function list(req: Request, res: Response): Promise<void> {
  const parsed = listWorkoutsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw badRequest('Parametri di ricerca non validi.');
  }
  const workouts = await workoutService.listWorkouts(parsed.data);
  res.json({ success: true, workouts });
}

export async function getOne(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw unauthorized('Autenticazione richiesta.');
  }

  const workout = await workoutService.getWorkoutById(parseId(req.params.id));

  // Un cliente puo' vedere solo le proprie schede.
  if (req.user.role === 'CLIENT' && workout.userId !== req.user.userId) {
    throw forbidden('Non puoi accedere a questa scheda.');
  }

  res.json({ success: true, workout });
}

export async function create(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw unauthorized('Autenticazione richiesta.');
  }
  const workout = await workoutService.createWorkout(req.body, req.user.userId);
  res.status(201).json({
    success: true,
    message: 'Scheda creata e assegnata.',
    workout,
  });
}

export async function update(req: Request, res: Response): Promise<void> {
  const workout = await workoutService.updateWorkout(parseId(req.params.id), req.body);
  res.json({ success: true, message: 'Scheda aggiornata.', workout });
}

export async function archive(req: Request, res: Response): Promise<void> {
  const workout = await workoutService.archiveWorkout(parseId(req.params.id));
  res.json({ success: true, message: 'Scheda archiviata.', workout });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await workoutService.deleteWorkout(parseId(req.params.id));
  res.json({ success: true, message: 'Scheda eliminata.' });
}

export async function duplicate(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw unauthorized('Autenticazione richiesta.');
  }

  const targetUserId = Number(req.body?.userId);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    throw badRequest('Seleziona il cliente di destinazione.');
  }

  const workout = await workoutService.duplicateWorkout(
    parseId(req.params.id),
    targetUserId,
    req.user.userId,
    typeof req.body?.name === 'string' ? req.body.name : undefined
  );

  res.status(201).json({ success: true, message: 'Scheda duplicata.', workout });
}

/** Storico schede del cliente autenticato. */
export async function myWorkouts(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw unauthorized('Autenticazione richiesta.');
  }
  const workouts = await workoutService.listWorkoutsForUser(req.user.userId, 10);
  res.json({ success: true, workouts });
}

/** Scheda attiva del cliente autenticato. */
export async function myActive(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw unauthorized('Autenticazione richiesta.');
  }
  const workout = await workoutService.getActiveWorkoutForUser(req.user.userId);
  res.json({ success: true, workout });
}

// ---------------------------------------------------------------------------
// SCHEDE RAPIDE
// ---------------------------------------------------------------------------

export async function listTemplates(req: Request, res: Response): Promise<void> {
  const templates = await workoutService.listTemplates();
  res.json({ success: true, templates });
}

export async function getTemplate(req: Request, res: Response): Promise<void> {
  const template = await workoutService.getTemplateById(parseId(req.params.id));
  res.json({ success: true, template });
}

export async function createTemplate(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw unauthorized('Autenticazione richiesta.');
  }
  const template = await workoutService.createTemplate(req.body, req.user.userId);
  res.status(201).json({
    success: true,
    message: 'Scheda rapida salvata.',
    template,
  });
}

export async function duplicateTemplate(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw unauthorized('Autenticazione richiesta.');
  }
  const template = await workoutService.duplicateTemplate(
    parseId(req.params.id),
    req.user.userId
  );
  res.status(201).json({
    success: true,
    message: 'Scheda rapida duplicata.',
    template,
  });
}

export async function updateTemplate(req: Request, res: Response): Promise<void> {
  const template = await workoutService.updateTemplate(parseId(req.params.id), req.body);
  res.json({ success: true, message: 'Scheda rapida aggiornata.', template });
}

export async function deleteTemplate(req: Request, res: Response): Promise<void> {
  await workoutService.deleteTemplate(parseId(req.params.id));
  res.json({ success: true, message: 'Scheda rapida eliminata.' });
}

/** Assegna un modello a un cliente creandone una copia. */
export async function assignTemplate(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw unauthorized('Autenticazione richiesta.');
  }

  const { userId, name, startDate, endDate } = req.body as {
    userId: number;
    name?: string;
    startDate?: string;
    endDate?: string;
  };

  const workout = await workoutService.assignTemplate(
    parseId(req.params.id),
    userId,
    req.user.userId,
    { name, startDate, endDate }
  );

  res.status(201).json({
    success: true,
    message: 'Scheda assegnata al cliente.',
    workout,
  });
}

/**
 * Scarica la scheda in PDF.
 *
 * Accessibile sia all'istruttore sia al cliente proprietario: il foglio
 * stampato serve soprattutto a chi si allena, per segnare a mano i
 * carichi durante la sessione.
 */
/** Forma dei dati restituiti da getWorkoutById, senza i tipi generati. */
type EsercizioSorgente = {
  order: number;
  sets: number;
  reps: string;
  restSeconds: number;
  suggestedWeight: unknown;
  notes: string | null;
  linkedToPrevious: boolean;
  exercise: { id: number; name: string; muscleGroup: string };
};
type GiornoSorgente = { label: string; exercises: EsercizioSorgente[] };

/**
 * Converte i giorni di una scheda nel formato atteso dal generatore PDF.
 * Condivisa fra la scheda di un cliente e la scheda rapida: è la stessa
 * struttura, e tenerne due copie significherebbe doversi ricordare di
 * aggiornarle entrambe.
 */
function giorniPerPdf(days: unknown): SchedaPdf['days'] {
  return (days as GiornoSorgente[]).map((giorno) => ({
    label: giorno.label,
    exercises: giorno.exercises.map((ex) => ({
      order: ex.order,
      sets: ex.sets,
      reps: ex.reps,
      restSeconds: ex.restSeconds,
      suggestedWeight: ex.suggestedWeight,
      notes: ex.notes,
      linkedToPrevious: ex.linkedToPrevious,
      exercise: {
        id: ex.exercise.id,
        name: ex.exercise.name,
        muscleGroup: ex.exercise.muscleGroup,
      },
    })),
  }));
}

/** Rimuove dal nome i caratteri non ammessi in un nome di file. */
function nomeFileSicuro(testo: string): string {
  return testo.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/** Scarica una scheda rapida in PDF. Riservata all'istruttore. */
export async function exportTemplatePdf(req: Request, res: Response): Promise<void> {
  const template = await workoutService.getTemplateById(parseId(req.params.id));

  const scheda: SchedaPdf = {
    name: template.name,
    startDate: null,
    endDate: null,
    notes: template.notes,
    modello: true,
    // Un modello non ha un cliente: i campi restano vuoti e
    // l'intestazione del PDF li omette del tutto.
    cliente: { firstName: null, lastName: null, username: '' },
    days: giorniPerPdf(template.days),
  };

  const nomeFile = `${nomeFileSicuro(template.name) || 'scheda_rapida'}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nomeFile}"`);

  const doc = generaPdfScheda(scheda);
  doc.pipe(res);
  doc.end();
}

export async function exportPdf(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw unauthorized('Autenticazione richiesta.');
  }

  const workout = await workoutService.getWorkoutById(parseId(req.params.id));

  if (req.user.role === 'CLIENT' && workout.userId !== req.user.userId) {
    throw forbidden('Non puoi scaricare questa scheda.');
  }

  const scheda: SchedaPdf = {
    name: workout.name,
    startDate: workout.startDate,
    endDate: workout.endDate,
    notes: workout.notes,
    cliente: {
      firstName: workout.user.firstName,
      lastName: workout.user.lastName,
      username: workout.user.username,
    },
    days: giorniPerPdf(workout.days),
  };

  // Nome del file leggibile: cognome, nome e data, come il protocollo cartaceo
  const parti = [workout.user.lastName, workout.user.firstName]
    .filter(Boolean)
    .join('_')
    .replace(/[^a-zA-Z0-9_]/g, '');
  const data = workout.startDate.toISOString().slice(0, 10).split('-').reverse().join('-');
  const nomeFile = `${parti || workout.user.username}_${data}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nomeFile}"`);

  const doc = generaPdfScheda(scheda);
  doc.pipe(res);
  doc.end();
}
