import { z } from 'zod';

export const createWeightLogSchema = z.object({
  exerciseId: z.number({ error: 'Esercizio non valido.' }).int().positive(),
  weight: z
    .number({ error: 'Inserisci il peso.' })
    .min(0, 'Il peso non può essere negativo.')
    .max(999, 'Peso non valido.'),
  reps: z
    .number()
    .int()
    .min(1, 'Le ripetizioni devono essere almeno 1.')
    .max(999, 'Ripetizioni non valide.')
    .nullable()
    .optional(),
  performedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato data non valido.')
    .optional(),
  notes: z.string().max(200, 'Note troppo lunghe.').optional(),
  /*
   * Solo per le piramidali: numero della serie (1, 2, 3...).
   * Registrare di nuovo la stessa serie nello stesso giorno sostituisce
   * il valore precedente invece di aggiungerne un altro.
   */
  setNumber: z
    .number()
    .int()
    .min(1, 'Numero della serie non valido.')
    .max(20, 'Numero della serie non valido.')
    .nullable()
    .optional(),
});

/** Correzione di una registrazione gia' salvata: si invia solo cio' che cambia. */
export const updateWeightLogSchema = z
  .object({
    weight: z
      .number({ error: 'Inserisci il peso.' })
      .min(0, 'Il peso non può essere negativo.')
      .max(999, 'Peso non valido.')
      .optional(),
    reps: z
      .number()
      .int()
      .min(1, 'Le ripetizioni devono essere almeno 1.')
      .max(999, 'Ripetizioni non valide.')
      .nullable()
      .optional(),
    performedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato data non valido.')
      .optional(),
    notes: z.string().max(200, 'Note troppo lunghe.').optional(),
  })
  .refine((dati) => Object.keys(dati).length > 0, {
    message: 'Nessuna modifica da salvare.',
  });

export const weightHistoryQuerySchema = z.object({
  exerciseId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export type CreateWeightLogInput = z.infer<typeof createWeightLogSchema>;
export type UpdateWeightLogInput = z.infer<typeof updateWeightLogSchema>;
export type WeightHistoryQuery = z.infer<typeof weightHistoryQuerySchema>;
