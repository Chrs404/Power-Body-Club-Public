import { z } from 'zod';

// L'opzione "error" copre il caso campo assente/non stringa,
// il messaggio dentro .min() copre il caso stringa vuota.
// Servono entrambi, altrimenti Zod ricade sui messaggi di default in inglese.
const requiredString = (message: string) =>
  z.string({ error: message }).min(1, message);

const passwordRules = z
  .string({ error: 'Inserisci la nuova password.' })
  .min(8, 'La password deve contenere almeno 8 caratteri.')
  .max(72, 'La password non può superare i 72 caratteri.')
  .regex(/[A-Za-z]/, 'La password deve contenere almeno una lettera.')
  .regex(/[0-9]/, 'La password deve contenere almeno un numero.');

export const loginSchema = z.object({
  username: requiredString('Inserisci lo username.'),
  password: requiredString('Inserisci la password.'),
});

// Nome e cognome sono facoltativi: di norma li ha gia' inseriti l'istruttore
// alla creazione del cliente. Restano accettati per i profili incompleti,
// dove il service li rende obbligatori.
export const firstAccessSchema = z.object({
  newPassword: passwordRules,
  firstName: z
    .string()
    .min(2, 'Il nome deve contenere almeno 2 caratteri.')
    .max(50, 'Il nome non può superare i 50 caratteri.')
    .optional(),
  lastName: z
    .string()
    .min(2, 'Il cognome deve contenere almeno 2 caratteri.')
    .max(50, 'Il cognome non può superare i 50 caratteri.')
    .optional(),
  email: z.email('Indirizzo email non valido.').optional(),
  phone: z
    .string()
    .max(20, 'Il numero di telefono non può superare i 20 caratteri.')
    .optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: requiredString('Inserisci la password attuale.'),
  newPassword: passwordRules,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type FirstAccessInput = z.infer<typeof firstAccessSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
