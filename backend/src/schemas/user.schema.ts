import { z } from 'zod';

const requiredString = (message: string) =>
  z.string({ error: message }).min(1, message);

const nameField = (label: string) =>
  z
    .string({ error: `Inserisci il ${label}.` })
    .min(2, `Il ${label} deve contenere almeno 2 caratteri.`)
    .max(50, `Il ${label} non può superare i 50 caratteri.`);

// Le date arrivano dal frontend come stringhe "YYYY-MM-DD".
const dateField = (label: string) =>
  z
    .string({ error: `Inserisci ${label}.` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label}: formato data non valido.`);

export const createClientSchema = z.object({
  firstName: nameField('nome'),
  lastName: nameField('cognome'),
  email: z.email('Indirizzo email non valido.').optional().or(z.literal('')),
  phone: z.string().max(20, 'Il telefono non può superare i 20 caratteri.').optional(),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data di nascita non valida.')
    .optional()
    .or(z.literal('')),
  notes: z.string().max(500, 'Le note non possono superare i 500 caratteri.').optional(),
  subscriptionStart: dateField("la data d'inizio abbonamento").optional().or(z.literal('')),
  subscriptionEnd: dateField('la data di scadenza abbonamento').optional().or(z.literal('')),
  subscriptionPlan: z.string().max(50).optional(),
});

export const updateClientSchema = z.object({
  firstName: nameField('nome').optional(),
  lastName: nameField('cognome').optional(),
  email: z.email('Indirizzo email non valido.').optional().or(z.literal('')),
  phone: z.string().max(20).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data di nascita non valida.').optional().or(z.literal('')),
  notes: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

export const createSubscriptionSchema = z.object({
  startDate: dateField("la data d'inizio"),
  endDate: dateField('la data di scadenza'),
  plan: z.string().max(50).optional(),
  notes: z.string().max(200).optional(),
});

export const updateProfileSchema = z.object({
  firstName: nameField('nome').optional(),
  lastName: nameField('cognome').optional(),
  email: z.email('Indirizzo email non valido.').optional().or(z.literal('')),
  phone: z.string().max(20).optional(),
});

export const listClientsQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(['all', 'active', 'inactive']).optional(),
  expiring: z.coerce.number().int().min(1).max(365).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;
