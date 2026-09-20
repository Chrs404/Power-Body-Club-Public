import { z } from 'zod';

/**
 * Ampiezza della finestra, in giorni, entro cui un abbonamento o una
 * scheda sono considerati "in scadenza". Gli elementi già scaduti sono
 * sempre inclusi, indipendentemente da questo valore.
 */
export const listRenewalsQuerySchema = z.object({
  giorni: z.coerce.number().int().min(1).max(365).optional(),
});

export type ListRenewalsQuery = z.infer<typeof listRenewalsQuerySchema>;
