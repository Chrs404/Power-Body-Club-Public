import { prisma } from '../prisma/client';
import { TransactionClient } from '../prisma/transaction';
import { todayUtc, parseDateOnly } from '../utils/date';
import { notFound, badRequest } from '../utils/app-error';
import {
  CreateNewsInput,
  UpdateNewsInput,
  UpdateScheduleInput,
  CreateClosureInput,
} from '../schemas/gym.schema';

const WEEK_ORDER = [
  'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY',
  'FRIDAY', 'SATURDAY', 'SUNDAY',
] as const;

type WeekDay = (typeof WEEK_ORDER)[number];

export interface DaySchedule {
  dayOfWeek: WeekDay;
  slots: { openTime: string; closeTime: string }[];
}

/**
 * Orari settimanali completi: include anche i giorni senza fasce
 * (chiusi), cosi' il frontend puo' mostrare l'intera settimana
 * senza doverla ricostruire.
 */
export async function getWeeklySchedule(): Promise<DaySchedule[]> {
  const rows = await prisma.gymSchedule.findMany({
    orderBy: [{ dayOfWeek: 'asc' as const }, { order: 'asc' as const }],
  });

  return WEEK_ORDER.map((day) => ({
    dayOfWeek: day,
    slots: rows
      .filter((r: { dayOfWeek: string }) => r.dayOfWeek === day)
      .map((r: { openTime: string; closeTime: string }) => ({
        openTime: r.openTime,
        closeTime: r.closeTime,
      })),
  }));
}

/** Chiusure future o in corso. */
export async function getUpcomingClosures(limit = 10) {
  return prisma.closure.findMany({
    where: { endDate: { gte: todayUtc() } },
    orderBy: { startDate: 'asc' as const },
    take: limit,
  });
}

export async function listNews(limit = 20) {
  return prisma.news.findMany({
    where: { isPublished: true },
    orderBy: { publishedAt: 'desc' as const },
    take: limit,
    select: {
      id: true,
      title: true,
      content: true,
      imageUrl: true,
      publishedAt: true,
    },
  });
}

// ---------------------------------------------------------------------------
// GESTIONE (solo istruttore)
// ---------------------------------------------------------------------------


function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Elenco completo per l'istruttore: include anche le bozze non pubblicate. */
export async function listAllNews(limit = 50) {
  return prisma.news.findMany({
    orderBy: { publishedAt: 'desc' as const },
    take: limit,
    select: {
      id: true,
      title: true,
      content: true,
      imageUrl: true,
      isPublished: true,
      publishedAt: true,
    },
  });
}

export async function createNews(authorId: number, input: CreateNewsInput) {
  return prisma.news.create({
    data: {
      authorId,
      title: input.title.trim(),
      content: input.content.trim(),
      imageUrl: emptyToNull(input.imageUrl),
      isPublished: input.isPublished ?? true,
    },
  });
}

export async function updateNews(id: number, input: UpdateNewsInput) {
  const existing = await prisma.news.findUnique({ where: { id } });
  if (!existing) {
    throw notFound('Comunicazione non trovata.');
  }

  return prisma.news.update({
    where: { id },
    data: {
      title: input.title?.trim(),
      content: input.content?.trim(),
      imageUrl: input.imageUrl !== undefined ? emptyToNull(input.imageUrl) : undefined,
      isPublished: input.isPublished,
    },
  });
}

export async function deleteNews(id: number): Promise<void> {
  const existing = await prisma.news.findUnique({ where: { id } });
  if (!existing) {
    throw notFound('Comunicazione non trovata.');
  }
  await prisma.news.delete({ where: { id } });
}

/**
 * Sostituisce l'intero orario settimanale.
 * Un diff su fasce orarie sarebbe piu' complesso senza vantaggi:
 * i dati sono pochi e vengono modificati di rado, tutti insieme.
 */
export async function replaceWeeklySchedule(input: UpdateScheduleInput) {
  return prisma.$transaction(async (tx: TransactionClient) => {
    await tx.gymSchedule.deleteMany({});

    const rows = input.days.flatMap((day) =>
      day.slots.map((slot, index) => ({
        dayOfWeek: day.dayOfWeek,
        order: index,
        openTime: slot.openTime,
        closeTime: slot.closeTime,
      }))
    );

    if (rows.length > 0) {
      await tx.gymSchedule.createMany({ data: rows });
    }

    return getWeeklySchedule();
  });
}

/** Elenco completo, incluse le chiusure passate. */
export async function listAllClosures(limit = 50) {
  return prisma.closure.findMany({
    orderBy: { startDate: 'desc' as const },
    take: limit,
  });
}

export async function createClosure(input: CreateClosureInput) {
  const startDate = parseDateOnly(input.startDate, "data d'inizio");
  const endDate = parseDateOnly(input.endDate, 'data di fine');

  if (endDate < startDate) {
    throw badRequest('La data di fine non può precedere quella di inizio.');
  }

  return prisma.closure.create({
    data: { startDate, endDate, reason: input.reason.trim() },
  });
}

export async function deleteClosure(id: number): Promise<void> {
  const existing = await prisma.closure.findUnique({ where: { id } });
  if (!existing) {
    throw notFound('Chiusura non trovata.');
  }
  await prisma.closure.delete({ where: { id } });
}
