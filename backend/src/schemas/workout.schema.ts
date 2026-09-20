import { z } from 'zod';

const dateField = (label: string) =>
  z
    .string({ error: `Inserisci ${label}.` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label}: formato data non valido.`);

const workoutExerciseSchema = z.object({
  exerciseId: z.number({ error: 'Esercizio non valido.' }).int().positive(),
  sets: z
    .number({ error: 'Indica il numero di serie.' })
    .int()
    .min(1, 'Almeno 1 serie.')
    .max(20, 'Massimo 20 serie.'),
  /*
   * String e non number: in palestra si scrive "8-10", "max", "12 per lato".
   *
   * Il limite è ampio perché qui rientra anche la notazione del tempo di
   * esecuzione, che è naturalmente discorsiva: "12 positiva 2 secondi,
   * fermo 1 secondo, negativa 4 secondi". Restando un campo di testo
   * libero, la colonna sul database è senza vincolo di lunghezza e non
   * serve alcuna migrazione per ampliarlo.
   */
  reps: z
    .string({ error: 'Indica le ripetizioni.' })
    .min(1, 'Indica le ripetizioni.')
    .max(120, 'Ripetizioni: testo troppo lungo (massimo 120 caratteri).'),
  restSeconds: z
    .number()
    .int()
    .min(0, 'Il recupero non può essere negativo.')
    .max(600, 'Recupero massimo: 600 secondi.')
    .optional(),
  suggestedWeight: z
    .number()
    .min(0, 'Il peso non può essere negativo.')
    .max(9999, 'Peso non valido.')
    .nullable()
    .optional(),
  notes: z.string().max(200, 'Note troppo lunghe.').optional(),
  // Superset: collegato all'esercizio precedente, eseguito di fila.
  linkedToPrevious: z.boolean().optional(),
});

const workoutDaySchema = z.object({
  label: z
    .string({ error: 'Indica il nome del giorno.' })
    .min(1, 'Indica il nome del giorno.')
    .max(50, 'Nome del giorno troppo lungo.'),
  exercises: z.array(workoutExerciseSchema),
});

export const createWorkoutSchema = z.object({
  userId: z.number({ error: 'Seleziona il cliente.' }).int().positive(),
  name: z
    .string({ error: 'Inserisci il nome della scheda.' })
    .min(2, 'Il nome deve contenere almeno 2 caratteri.')
    .max(80, 'Il nome non può superare gli 80 caratteri.'),
  startDate: dateField("la data d'inizio"),
  endDate: dateField('la data di fine').optional().or(z.literal('')),
  notes: z.string().max(500, 'Note troppo lunghe.').optional(),
  days: z
    .array(workoutDaySchema)
    .min(1, 'Aggiungi almeno un giorno di allenamento.')
    .max(7, 'Massimo 7 giorni.'),
});

export const updateWorkoutSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  startDate: dateField("la data d'inizio").optional(),
  endDate: dateField('la data di fine').optional().or(z.literal('')),
  notes: z.string().max(500).optional(),
  days: z.array(workoutDaySchema).min(1).max(7).optional(),
});

export const listWorkoutsQuerySchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED', 'all']).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export type CreateWorkoutInput = z.infer<typeof createWorkoutSchema>;
export type UpdateWorkoutInput = z.infer<typeof updateWorkoutSchema>;
export type ListWorkoutsQuery = z.infer<typeof listWorkoutsQuerySchema>;

/** Un modello non ha cliente ne' periodo di validita'. */
export const createTemplateSchema = createWorkoutSchema.omit({
  userId: true,
  startDate: true,
  endDate: true,
});

export const assignTemplateSchema = z.object({
  userId: z.number({ error: 'Seleziona il cliente.' }).int().positive(),
  name: z.string().max(80).optional(),
  startDate: dateField("la data d'inizio").optional(),
  endDate: dateField('la data di fine').optional().or(z.literal('')),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type AssignTemplateInput = z.infer<typeof assignTemplateSchema>;
