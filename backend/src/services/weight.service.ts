import { prisma } from '../prisma/client';
import { parseDateOnly, todayUtc } from '../utils/date';
import { badRequest } from '../utils/app-error';
import { CreateWeightLogInput, WeightHistoryQuery } from '../schemas/training.schema';

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function createWeightLog(userId: number, input: CreateWeightLogInput) {
  const exercise = await prisma.exercise.findUnique({
    where: { id: input.exerciseId },
    select: { id: true },
  });

  if (!exercise) {
    throw badRequest('Esercizio non trovato.');
  }

  return prisma.weightLog.create({
    data: {
      userId,
      exerciseId: input.exerciseId,
      weight: input.weight,
      reps: input.reps ?? null,
      performedAt: input.performedAt
        ? parseDateOnly(input.performedAt, 'data')
        : todayUtc(),
      notes: emptyToNull(input.notes),
    },
    include: { exercise: { select: { id: true, name: true, muscleGroup: true } } },
  });
}

export async function listWeightLogs(userId: number, query: WeightHistoryQuery) {
  return prisma.weightLog.findMany({
    where: {
      userId,
      ...(query.exerciseId ? { exerciseId: query.exerciseId } : {}),
    },
    orderBy: [{ performedAt: 'desc' as const }, { createdAt: 'desc' as const }],
    take: query.limit ?? 50,
    include: { exercise: { select: { id: true, name: true, muscleGroup: true } } },
  });
}

export async function deleteWeightLog(userId: number, logId: number): Promise<void> {
  // Il filtro su userId impedisce di eliminare la registrazione di un altro.
  const result = await prisma.weightLog.deleteMany({
    where: { id: logId, userId },
  });

  if (result.count === 0) {
    throw badRequest('Registrazione non trovata.');
  }
}

/**
 * Ultimo peso registrato per ciascun esercizio, con il precedente
 * per calcolare la variazione. Serve a mostrare "62.5 kg (+2.5)"
 * accanto all'esercizio nella scheda.
 */
export async function getLatestWeights(userId: number) {
  const logs = await prisma.weightLog.findMany({
    where: { userId },
    orderBy: [{ performedAt: 'desc' as const }, { createdAt: 'desc' as const }],
    take: 300,
    select: {
      exerciseId: true,
      weight: true,
      performedAt: true,
    },
  });

  type Row = { exerciseId: number; weight: unknown; performedAt: Date };
  const byExercise = new Map<number, { last: number; previous: number | null; date: Date }>();

  for (const log of logs as Row[]) {
    const weight = Number(log.weight);
    const entry = byExercise.get(log.exerciseId);

    if (!entry) {
      byExercise.set(log.exerciseId, {
        last: weight,
        previous: null,
        date: log.performedAt,
      });
    } else if (entry.previous === null) {
      entry.previous = weight;
    }
  }

  return [...byExercise.entries()].map(([exerciseId, v]) => ({
    exerciseId,
    lastWeight: v.last,
    previousWeight: v.previous,
    delta: v.previous !== null ? Math.round((v.last - v.previous) * 100) / 100 : null,
    performedAt: v.date,
  }));
}
