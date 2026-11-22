import { Request, Response } from 'express';
import * as renewalsService from '../services/renewals.service';
import * as cleanupService from '../services/cleanup.service';
import { listRenewalsQuerySchema } from '../schemas/renewals.schema';
import { badRequest } from '../utils/app-error';

export async function list(req: Request, res: Response): Promise<void> {
  const parsed = listRenewalsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw badRequest('Parametri non validi.');
  }

  // Insieme alle scadenze, i clienti che stanno per essere eliminati:
  // la pagina Clienti e la Home li mostrano accanto, e una sola chiamata
  // garantisce che i due elenchi descrivano lo stesso istante.
  const [items, deletions] = await Promise.all([
    renewalsService.getRenewals(parsed.data.giorni),
    cleanupService.getClientiInEliminazione(),
  ]);

  // Conteggi derivati dalla stessa lista: l'elenco per una singola
  // palestra è piccolo, non serve una seconda query per i totali.
  //
  // Il controllo su null non è una formalità: chi non ha un abbonamento
  // ha daysLeft null, e `null >= 0` in JavaScript è vero. Senza questo
  // filtro quei clienti finirebbero contati fra quelli "in scadenza".
  const conta = (tipo: 'subscription' | 'workout', scaduti: boolean) =>
    items.filter(
      (i) =>
        i.type === tipo &&
        i.daysLeft !== null &&
        (scaduti ? i.daysLeft < 0 : i.daysLeft >= 0)
    ).length;

  res.json({
    success: true,
    items,
    deletions,
    summary: {
      deletions: deletions.length,
      subscriptions: { expired: conta('subscription', true), expiring: conta('subscription', false) },
      workouts: { expired: conta('workout', true), expiring: conta('workout', false) },
    },
  });
}
