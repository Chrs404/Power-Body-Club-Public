import { prisma } from '../prisma/client';
import { notFound, conflict } from '../utils/app-error';
import {
  CreateExerciseInput,
  UpdateExerciseInput,
  ListExercisesQuery,
} from '../schemas/exercise.schema';

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function listExercises(query: ListExercisesQuery) {
  const search = query.search?.trim();
  const insensitive = 'insensitive' as const;

  const where = {
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(query.muscleGroup ? { muscleGroup: query.muscleGroup } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: insensitive } },
            { description: { contains: search, mode: insensitive } },
          ],
        }
      : {}),
  };

  return prisma.exercise.findMany({
    where,
    orderBy: [{ muscleGroup: 'asc' as const }, { name: 'asc' as const }],
  });
}

export async function getExerciseById(id: number) {
  const exercise = await prisma.exercise.findUnique({ where: { id } });
  if (!exercise) {
    throw notFound('Esercizio non trovato.');
  }
  return exercise;
}

export async function createExercise(input: CreateExerciseInput) {
  const name = input.name.trim();

  const duplicate = await prisma.exercise.findFirst({
    where: { name, muscleGroup: input.muscleGroup },
  });
  if (duplicate) {
    throw conflict('Esiste già un esercizio con questo nome per lo stesso gruppo muscolare.');
  }

  return prisma.exercise.create({
    data: {
      name,
      muscleGroup: input.muscleGroup,
      description: emptyToNull(input.description),
      imageUrl: emptyToNull(input.imageUrl),
      videoUrl: emptyToNull(input.videoUrl),
    },
  });
}

export async function updateExercise(id: number, input: UpdateExerciseInput) {
  const existing = await prisma.exercise.findUnique({ where: { id } });
  if (!existing) {
    throw notFound('Esercizio non trovato.');
  }

  const name = input.name?.trim();
  const muscleGroup = input.muscleGroup ?? existing.muscleGroup;

  if (name || input.muscleGroup) {
    const duplicate = await prisma.exercise.findFirst({
      where: {
        name: name ?? existing.name,
        muscleGroup,
        id: { not: id },
      },
    });
    if (duplicate) {
      throw conflict('Esiste già un esercizio con questo nome per lo stesso gruppo muscolare.');
    }
  }

  return prisma.exercise.update({
    where: { id },
    data: {
      name,
      muscleGroup: input.muscleGroup,
      description: input.description !== undefined ? emptyToNull(input.description) : undefined,
      imageUrl: input.imageUrl !== undefined ? emptyToNull(input.imageUrl) : undefined,
      videoUrl: input.videoUrl !== undefined ? emptyToNull(input.videoUrl) : undefined,
      isActive: input.isActive,
    },
  });
}

/**
 * Elimina l'esercizio solo se non e' mai stato usato in una scheda.
 * Altrimenti lo disattiva: eliminarlo cancellerebbe a cascata righe di
 * schede storiche e lo storico pesi collegato.
 */
export async function removeExercise(id: number) {
  const existing = await prisma.exercise.findUnique({ where: { id } });
  if (!existing) {
    throw notFound('Esercizio non trovato.');
  }

  const [usedInWorkouts, usedInLogs] = await Promise.all([
    prisma.workoutExercise.count({ where: { exerciseId: id } }),
    prisma.weightLog.count({ where: { exerciseId: id } }),
  ]);

  if (usedInWorkouts === 0 && usedInLogs === 0) {
    await prisma.exercise.delete({ where: { id } });
    return { deleted: true };
  }

  await prisma.exercise.update({ where: { id }, data: { isActive: false } });
  return { deleted: false };
}
