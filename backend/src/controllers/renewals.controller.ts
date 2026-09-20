import { Request, Response } from 'express';
import * as renewalsService from '../services/renewals.service';
import { listRenewalsQuerySchema } from '../schemas/renewals.schema';
import { badRequest } from '../utils/app-error';

export async function list(req: Request, res: Response): Promise<void> {
  const parsed = listRenewalsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw badRequest('Parametri non validi.');
  }

  const items = await renewalsService.getRenewals(parsed.data.giorni);

  // Conteggi derivati dalla stessa lista: l'elenco per una singola
  // palestra è piccolo, non serve una seconda query per i totali.
  const conta = (tipo: 'subscription' | 'workout', scaduti: boolean) =>
    items.filter(
      (i) => i.type === tipo && (scaduti ? i.daysLeft < 0 : i.daysLeft >= 0)
    ).length;

  res.json({
    success: true,
    items,
    summary: {
      subscriptions: { expired: conta('subscription', true), expiring: conta('subscription', false) },
      workouts: { expired: conta('workout', true), expiring: conta('workout', false) },
    },
  });
}
