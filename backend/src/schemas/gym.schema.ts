import { z } from 'zod';

const WEEK_DAYS = [
  'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY',
  'FRIDAY', 'SATURDAY', 'SUNDAY',
] as const;

const timeField = (label: string) =>
  z
    .string({ error: `Inserisci ${label}.` })
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label}: usa il formato HH:mm.`);

const dateField = (label: string) =>
  z
    .string({ error: `Inserisci ${label}.` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label}: formato data non valido.`);

// --- News ---

export const createNewsSchema = z.object({
  title: z
    .string({ error: 'Inserisci il titolo.' })
    .min(3, 'Il titolo deve contenere almeno 3 caratteri.')
    .max(120, 'Il titolo non può superare i 120 caratteri.'),
  content: z
    .string({ error: 'Inserisci il testo.' })
    .min(5, 'Il testo deve contenere almeno 5 caratteri.')
    .max(5000, 'Il testo non può superare i 5000 caratteri.'),
  imageUrl: z
    .string()
    .max(500)
    .refine((v) => v === '' || /^https?:\/\/.+/.test(v), {
      message: 'Immagine: deve iniziare con http:// o https://',
    })
    .optional(),
  isPublished: z.boolean().optional(),
});

export const updateNewsSchema = createNewsSchema.partial();

// --- Orari ---

const slotSchema = z
  .object({
    openTime: timeField('orario di apertura'),
    closeTime: timeField('orario di chiusura'),
  })
  .refine((s) => s.closeTime > s.openTime, {
    message: 'La chiusura deve essere successiva all\u2019apertura.',
    path: ['closeTime'],
  });

export const updateScheduleSchema = z.object({
  days: z
    .array(
      z.object({
        dayOfWeek: z.enum(WEEK_DAYS, { error: 'Giorno non valido.' }),
        // Array vuoto = giorno di chiusura.
        slots: z.array(slotSchema).max(3, 'Massimo 3 fasce per giorno.'),
      })
    )
    .min(1, 'Indica almeno un giorno.')
    .max(7, 'Massimo 7 giorni.'),
});

// --- Chiusure ---

export const createClosureSchema = z
  .object({
    startDate: dateField("la data d'inizio"),
    endDate: dateField('la data di fine'),
    reason: z
      .string({ error: 'Indica il motivo.' })
      .min(2, 'Il motivo deve contenere almeno 2 caratteri.')
      .max(200, 'Il motivo non può superare i 200 caratteri.'),
  })
  .refine((c) => c.endDate >= c.startDate, {
    message: 'La data di fine non può precedere quella di inizio.',
    path: ['endDate'],
  });

export type CreateNewsInput = z.infer<typeof createNewsSchema>;
export type UpdateNewsInput = z.infer<typeof updateNewsSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type CreateClosureInput = z.infer<typeof createClosureSchema>;
