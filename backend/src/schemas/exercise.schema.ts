import { z } from 'zod';

export const MUSCLE_GROUPS = [
  'QUADRICEPS', 'ADDUCTORS', 'ABDUCTORS', 'HAMSTRINGS',
  'CALVES', 'LATS', 'CHEST', 'DELTOIDS',
  'TRAPS', 'TRICEPS', 'BICEPS', 'FOREARMS',
  'GLUTES', 'ABS', 'LOWER_BACK', 'CARDIO',
] as const;

const urlField = (label: string) =>
  z
    .string()
    .max(500, `${label}: indirizzo troppo lungo.`)
    .refine((v) => v === '' || /^https?:\/\/.+/.test(v), {
      message: `${label}: deve iniziare con http:// o https://`,
    })
    .optional();

export const createExerciseSchema = z.object({
  name: z
    .string({ error: "Inserisci il nome dell'esercizio." })
    .min(2, 'Il nome deve contenere almeno 2 caratteri.')
    .max(80, 'Il nome non può superare gli 80 caratteri.'),
  muscleGroup: z.enum(MUSCLE_GROUPS, { error: 'Seleziona un gruppo muscolare.' }),
  description: z.string().max(500, 'La descrizione non può superare i 500 caratteri.').optional(),
  imageUrl: urlField('Immagine'),
  videoUrl: urlField('Video'),
});

export const updateExerciseSchema = createExerciseSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const listExercisesQuerySchema = z.object({
  search: z.string().optional(),
  muscleGroup: z.enum(MUSCLE_GROUPS).optional(),
  includeInactive: z.coerce.boolean().optional(),
});

export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;
export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;
export type ListExercisesQuery = z.infer<typeof listExercisesQuerySchema>;
