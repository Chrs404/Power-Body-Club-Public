import { prisma } from '../prisma/client';
import { TransactionClient } from '../prisma/transaction';
import { parseDateOnly } from '../utils/date';
import { notFound, badRequest } from '../utils/app-error';
import { normalizzaCollegamenti } from '../utils/superset';
import {
  CreateWorkoutInput,
  UpdateWorkoutInput,
  ListWorkoutsQuery,
} from '../schemas/workout.schema';

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Struttura completa: giorni ordinati, esercizi ordinati, dati del catalogo. */
const workoutInclude = {
  days: {
    orderBy: { order: 'asc' as const },
    include: {
      exercises: {
        orderBy: { order: 'asc' as const },
        include: {
          exercise: {
            select: {
              id: true,
              name: true,
              muscleGroup: true,
              description: true,
              imageUrl: true,
              videoUrl: true,
            },
          },
        },
      },
    },
  },
};

/** Trasforma i giorni del payload in input Prisma annidato. */
function buildDaysCreateInput(days: CreateWorkoutInput['days']) {
  return days.map((day, dayIndex) => {
    // La prima riga non puo' essere collegata a nulla: se il client
    // inviasse un dato incoerente verrebbe corretto qui.
    const esercizi = normalizzaCollegamenti(day.exercises);

    return {
      label: day.label.trim(),
      order: dayIndex,
      exercises: {
        create: esercizi.map((exercise, exerciseIndex) => ({
          exerciseId: exercise.exerciseId,
          order: exerciseIndex,
          sets: exercise.sets,
          reps: exercise.reps.trim(),
          restSeconds: exercise.restSeconds ?? 60,
          suggestedWeight: exercise.suggestedWeight ?? null,
          notes: emptyToNull(exercise.notes),
          linkedToPrevious: exercise.linkedToPrevious === true,
        })),
      },
    };
  });
}

/** Verifica che tutti gli id esercizio esistano davvero nel catalogo. */
async function assertExercisesExist(days: CreateWorkoutInput['days']): Promise<void> {
  const ids = [...new Set(days.flatMap((d) => d.exercises.map((e) => e.exerciseId)))];
  if (ids.length === 0) {
    throw badRequest('Aggiungi almeno un esercizio alla scheda.');
  }

  const found = await prisma.exercise.count({ where: { id: { in: ids } } });
  if (found !== ids.length) {
    throw badRequest('Uno o più esercizi selezionati non esistono più.');
  }
}

export async function listWorkouts(query: ListWorkoutsQuery) {
  const where = {
    // I modelli non sono schede di nessuno: vanno esclusi da ogni elenco.
    isTemplate: false,
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.status && query.status !== 'all' ? { status: query.status } : {}),
  };

  return prisma.workout.findMany({
    where,
    orderBy: [{ status: 'asc' as const }, { startDate: 'desc' as const }],
    take: query.limit ?? 10,
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      notes: true,
      createdAt: true,
      user: { select: { id: true, firstName: true, lastName: true, username: true } },
      _count: { select: { days: true } },
    },
  });
}

/** Storico schede del cliente autenticato, attiva per prima. */
export async function listWorkoutsForUser(userId: number, limit = 10) {
  return prisma.workout.findMany({
    where: { userId, isTemplate: false },
    orderBy: [{ status: 'asc' as const }, { startDate: 'desc' as const }],
    take: limit,
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      notes: true,
      createdAt: true,
      _count: { select: { days: true } },
    },
  });
}

export async function getWorkoutById(id: number) {
  const workout = await prisma.workout.findUnique({
    where: { id },
    include: {
      ...workoutInclude,
      user: { select: { id: true, firstName: true, lastName: true, username: true } },
    },
  });

  if (!workout) {
    throw notFound('Scheda non trovata.');
  }
  return workout;
}

export async function getActiveWorkoutForUser(userId: number) {
  return prisma.workout.findFirst({
    where: { userId, status: 'ACTIVE', isTemplate: false },
    orderBy: { startDate: 'desc' as const },
    include: workoutInclude,
  });
}

/**
 * Crea una nuova scheda e la rende attiva.
 *
 * L'archiviazione della precedente e la creazione della nuova avvengono
 * nella stessa transazione: il vincolo "una sola scheda ACTIVE per utente"
 * non e' esprimibile in Prisma (servirebbe un indice unico parziale),
 * quindi va garantito qui. Senza transazione, un errore a meta' lascerebbe
 * il cliente con zero schede attive o con due.
 */
export async function createWorkout(input: CreateWorkoutInput, createdById: number) {
  const client = await prisma.user.findFirst({
    where: { id: input.userId, role: 'CLIENT' },
  });
  if (!client) {
    throw notFound('Cliente non trovato.');
  }

  await assertExercisesExist(input.days);

  const startDate = parseDateOnly(input.startDate, "data d'inizio");
  const endDate = input.endDate ? parseDateOnly(input.endDate, 'data di fine') : null;

  if (endDate && endDate <= startDate) {
    throw badRequest('La data di fine deve essere successiva a quella di inizio.');
  }

  return prisma.$transaction(async (tx: TransactionClient) => {
    // La scheda precedente diventa storica. Se non aveva una data di fine,
    // le viene assegnata quella di inizio della nuova.
    await tx.workout.updateMany({
      where: { userId: input.userId, status: 'ACTIVE', isTemplate: false },
      data: { status: 'ARCHIVED' },
    });

    await tx.workout.updateMany({
      where: {
        userId: input.userId,
        status: 'ARCHIVED',
        endDate: null,
        isTemplate: false,
      },
      data: { endDate: startDate },
    });

    return tx.workout.create({
      data: {
        userId: input.userId,
        createdById,
        name: input.name.trim(),
        status: 'ACTIVE',
        startDate,
        endDate,
        notes: emptyToNull(input.notes),
        days: { create: buildDaysCreateInput(input.days) },
      },
      include: workoutInclude,
    });
  });
}

/**
 * Aggiorna una scheda. Se arrivano i giorni, l'intera struttura viene
 * ricostruita: gestire diff su giorni ed esercizi sarebbe molto piu'
 * complesso e senza vantaggi pratici a questa scala.
 *
 * Nota: ricreando le righe si perdono i completamenti gia' registrati
 * per la sessione in corso, che puntano a WorkoutExercise. E' accettabile,
 * perche' modificare la scheda equivale a proporre un allenamento diverso.
 */
export async function updateWorkout(id: number, input: UpdateWorkoutInput) {
  const existing = await prisma.workout.findUnique({ where: { id } });
  if (!existing) {
    throw notFound('Scheda non trovata.');
  }

  const startDate = input.startDate
    ? parseDateOnly(input.startDate, "data d'inizio")
    : existing.startDate;
  const endDate =
    input.endDate !== undefined
      ? input.endDate
        ? parseDateOnly(input.endDate, 'data di fine')
        : null
      : existing.endDate;

  if (endDate && endDate <= startDate) {
    throw badRequest('La data di fine deve essere successiva a quella di inizio.');
  }

  if (input.days) {
    await assertExercisesExist(input.days);
  }

  return prisma.$transaction(async (tx: TransactionClient) => {
    if (input.days) {
      // onDelete: Cascade elimina anche WorkoutExercise e CompletedExercise.
      await tx.workoutDay.deleteMany({ where: { workoutId: id } });
    }

    return tx.workout.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        startDate: input.startDate ? startDate : undefined,
        endDate: input.endDate !== undefined ? endDate : undefined,
        notes: input.notes !== undefined ? emptyToNull(input.notes) : undefined,
        ...(input.days ? { days: { create: buildDaysCreateInput(input.days) } } : {}),
      },
      include: workoutInclude,
    });
  });
}

export async function archiveWorkout(id: number) {
  const existing = await prisma.workout.findUnique({ where: { id } });
  if (!existing) {
    throw notFound('Scheda non trovata.');
  }
  if (existing.status === 'ARCHIVED') {
    throw badRequest('La scheda è già archiviata.');
  }

  return prisma.workout.update({
    where: { id },
    data: { status: 'ARCHIVED', endDate: existing.endDate ?? new Date() },
  });
}

export async function deleteWorkout(id: number): Promise<void> {
  const existing = await prisma.workout.findUnique({ where: { id } });
  if (!existing) {
    throw notFound('Scheda non trovata.');
  }
  await prisma.workout.delete({ where: { id } });
}

/** Duplica una scheda esistente su un altro cliente o come nuova versione. */
export async function duplicateWorkout(
  sourceId: number,
  targetUserId: number,
  createdById: number,
  name?: string
) {
  const source = await getWorkoutById(sourceId);

  type SourceExercise = {
    exerciseId: number;
    sets: number;
    reps: string;
    restSeconds: number;
    suggestedWeight: unknown;
    notes: string | null;
    linkedToPrevious: boolean;
  };
  type SourceDay = { label: string; exercises: SourceExercise[] };

  const days = (source.days as SourceDay[]).map((day) => ({
    label: day.label,
    exercises: day.exercises.map((we) => ({
      exerciseId: we.exerciseId,
      sets: we.sets,
      reps: we.reps,
      restSeconds: we.restSeconds,
      suggestedWeight: we.suggestedWeight ? Number(we.suggestedWeight) : null,
      notes: we.notes ?? undefined,
      linkedToPrevious: we.linkedToPrevious,
    })),
  }));

  const today = new Date();
  const startDate = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;

  return createWorkout(
    {
      userId: targetUserId,
      name: name?.trim() || `${source.name} (copia)`,
      startDate,
      notes: source.notes ?? undefined,
      days,
    },
    createdById
  );
}

// ---------------------------------------------------------------------------
// SCHEDE RAPIDE (modelli)
// ---------------------------------------------------------------------------

/**
 * Elenco dei modelli disponibili.
 *
 * Non sono filtrati per istruttore: la palestra ne ha uno solo, e un
 * filtro per autore renderebbe i modelli invisibili se un domani
 * cambiasse il titolare dell'account.
 */
export async function listTemplates() {
  return prisma.workout.findMany({
    where: { isTemplate: true },
    orderBy: { name: 'asc' as const },
    select: {
      id: true,
      name: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { days: true } },
      days: {
        orderBy: { order: 'asc' as const },
        select: { id: true, label: true, _count: { select: { exercises: true } } },
      },
    },
  });
}

export async function getTemplateById(id: number) {
  const template = await prisma.workout.findFirst({
    where: { id, isTemplate: true },
    include: workoutInclude,
  });

  if (!template) {
    throw notFound('Scheda rapida non trovata.');
  }
  return template;
}

/**
 * Crea un modello.
 *
 * Il modello risulta intestato all'istruttore, non a un cliente: serve
 * perche' la colonna userId e' obbligatoria, ma non ha alcun effetto
 * pratico visto che tutte le query dei clienti escludono i modelli.
 *
 * A differenza di una scheda vera, creare un modello non archivia nulla.
 */
export async function createTemplate(
  input: Omit<CreateWorkoutInput, 'userId'>,
  createdById: number
) {
  await assertExercisesExist(input.days);

  return prisma.workout.create({
    data: {
      userId: createdById,
      createdById,
      name: input.name.trim(),
      isTemplate: true,
      status: 'ARCHIVED',
      // Data simbolica: un modello non ha un periodo di validita'.
      startDate: new Date(),
      endDate: null,
      notes: emptyToNull(input.notes),
      days: { create: buildDaysCreateInput(input.days) },
    },
    include: workoutInclude,
  });
}

export async function updateTemplate(
  id: number,
  input: UpdateWorkoutInput
) {
  await getTemplateById(id);

  if (input.days) {
    await assertExercisesExist(input.days);
  }

  return prisma.$transaction(async (tx: TransactionClient) => {
    if (input.days) {
      await tx.workoutDay.deleteMany({ where: { workoutId: id } });
    }

    return tx.workout.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        notes: input.notes !== undefined ? emptyToNull(input.notes) : undefined,
        ...(input.days ? { days: { create: buildDaysCreateInput(input.days) } } : {}),
      },
      include: workoutInclude,
    });
  });
}

export async function deleteTemplate(id: number): Promise<void> {
  await getTemplateById(id);
  await prisma.workout.delete({ where: { id } });
}

/**
 * Assegna un modello a un cliente.
 *
 * Il modello viene copiato, non spostato: resta disponibile per gli altri
 * clienti. La copia diventa la scheda attiva e archivia la precedente,
 * esattamente come una scheda creata da zero.
 */
type EsercizioSorgente = {
  exerciseId: number;
  sets: number;
  reps: string;
  restSeconds: number;
  suggestedWeight: unknown;
  notes: string | null;
  linkedToPrevious: boolean;
};
type GiornoSorgente = { label: string; exercises: EsercizioSorgente[] };

/**
 * Converte i giorni di un modello nel formato accettato in creazione.
 *
 * Serve sia all'assegnazione a un cliente sia alla duplicazione: sono
 * due copie della stessa struttura, e tenerne una sola versione evita
 * che un campo aggiunto in futuro (come e' stato linkedToPrevious per i
 * superset) venga ricordato in un punto e dimenticato nell'altro.
 */
function copiaGiorniDaModello(days: unknown): CreateWorkoutInput['days'] {
  return (days as GiornoSorgente[]).map((day) => ({
    label: day.label,
    exercises: day.exercises.map((we) => ({
      exerciseId: we.exerciseId,
      sets: we.sets,
      reps: we.reps,
      restSeconds: we.restSeconds,
      suggestedWeight: we.suggestedWeight ? Number(we.suggestedWeight) : null,
      notes: we.notes ?? undefined,
      linkedToPrevious: we.linkedToPrevious,
    })),
  }));
}

/**
 * Duplica un modello, creandone una copia indipendente.
 *
 * Utile per partire da una scheda rapida esistente e variarla — cambiare
 * i giorni, sostituire qualche esercizio — senza perdere l'originale.
 */
export async function duplicateTemplate(id: number, createdById: number) {
  const originale = await getTemplateById(id);

  return prisma.workout.create({
    data: {
      userId: createdById,
      createdById,
      name: `${originale.name} (copia)`,
      isTemplate: true,
      status: 'ARCHIVED',
      startDate: new Date(),
      endDate: null,
      notes: originale.notes,
      days: {
        create: buildDaysCreateInput(copiaGiorniDaModello(originale.days)),
      },
    },
    include: workoutInclude,
  });
}

export async function assignTemplate(
  templateId: number,
  targetUserId: number,
  createdById: number,
  opzioni: { name?: string; startDate?: string; endDate?: string } = {}
) {
  const template = await getTemplateById(templateId);
  const days = copiaGiorniDaModello(template.days);

  const oggi = new Date();
  const dataDefault = `${oggi.getUTCFullYear()}-${String(oggi.getUTCMonth() + 1).padStart(2, '0')}-${String(oggi.getUTCDate()).padStart(2, '0')}`;

  return createWorkout(
    {
      userId: targetUserId,
      name: opzioni.name?.trim() || template.name,
      startDate: opzioni.startDate || dataDefault,
      endDate: opzioni.endDate || undefined,
      notes: template.notes ?? undefined,
      days,
    },
    createdById
  );
}
