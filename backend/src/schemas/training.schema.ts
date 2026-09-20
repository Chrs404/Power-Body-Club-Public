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
});

export const weightHistoryQuerySchema = z.object({
  exerciseId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export type CreateWeightLogInput = z.infer<typeof createWeightLogSchema>;
export type WeightHistoryQuery = z.infer<typeof weightHistoryQuerySchema>;
