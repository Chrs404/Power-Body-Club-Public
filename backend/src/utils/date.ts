import { badRequest } from './app-error';

/**
 * Converte "YYYY-MM-DD" in Date a mezzanotte UTC.
 * Usare il costruttore Date con la sola stringa produce spostamenti
 * di un giorno a seconda del fuso orario del server.
 */
export function parseDateOnly(value: string, label = 'data'): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw badRequest(`Formato ${label} non valido.`);
  }

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  if (Number.isNaN(date.getTime())) {
    throw badRequest(`Formato ${label} non valido.`);
  }
  return date;
}

/** Data odierna a mezzanotte UTC, per confronti su colonne @db.Date. */
export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function addDaysUtc(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
