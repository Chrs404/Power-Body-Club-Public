import { prisma } from '../prisma/client';
import { notFound, badRequest } from '../utils/app-error';
import { bloccoDi, dividiInBlocchi } from '../utils/superset';

/**
 * Sessione = un allenamento svolto. Contiene i completamenti degli esercizi.
 *
 * Separare la sessione dalla scheda e' cio' che permette il reset senza
 * perdere lo storico: la scheda assegnata non viene mai toccata,
 * cambia solo quale sessione e' aperta.
 */
async function getActiveWorkoutOrFail(userId: number) {
  const workout = await prisma.workout.findFirst({
    where: { userId, status: 'ACTIVE', isTemplate: false },
    orderBy: { startDate: 'desc' as const },
    select: { id: true, name: true },
  });

  if (!workout) {
    throw notFound('Non hai una scheda attiva.');
  }
  return workout;
}

/**
 * Restituisce la sessione aperta, creandola al primo utilizzo.
 * "Aperta" significa completedAt null.
 */
export async function getOrCreateCurrentSession(userId: number) {
  const workout = await getActiveWorkoutOrFail(userId);

  const existing = await prisma.workoutSession.findFirst({
    where: { userId, workoutId: workout.id, completedAt: null },
    orderBy: { startedAt: 'desc' as const },
    include: {
      completed: { select: { workoutExerciseId: true, completedAt: true } },
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.workoutSession.create({
    data: { userId, workoutId: workout.id },
    include: {
      completed: { select: { workoutExerciseId: true, completedAt: true } },
    },
  });
}

/**
 * Restituisce gli identificativi di tutti gli esercizi del blocco a cui
 * appartiene quello indicato, verificando che faccia parte della scheda
 * attiva della sessione.
 *
 * Per un esercizio singolo il blocco contiene solo lui. Per un superset
 * contiene tutti i membri: la spunta e' unica per l'intero gruppo,
 * perche' gli esercizi di un superset si eseguono insieme e spuntarli
 * separatamente non avrebbe significato.
 */
async function idsDelBlocco(
  workoutId: number,
  workoutExerciseId: number
): Promise<number[]> {
  const riga = await prisma.workoutExercise.findFirst({
    where: { id: workoutExerciseId, workoutDay: { workoutId } },
    select: { id: true, workoutDayId: true },
  });

  if (!riga) {
    throw badRequest('Esercizio non presente nella scheda attiva.');
  }

  const righeDelGiorno = await prisma.workoutExercise.findMany({
    where: { workoutDayId: riga.workoutDayId },
    orderBy: { order: 'asc' as const },
    select: { id: true, linkedToPrevious: true },
  });

  const blocco = bloccoDi(righeDelGiorno, workoutExerciseId);
  return blocco.length > 0 ? blocco.map((r) => r.id) : [workoutExerciseId];
}

/**
 * Verifica se tutti i blocchi del giorno a cui appartiene l'esercizio
 * risultano completati nella sessione indicata.
 *
 * Il confronto e' sui blocchi e non sui singoli esercizi perche' un
 * superset si spunta una volta sola, quindi i suoi membri sono sempre
 * completati insieme.
 */
async function giornoCompletato(
  sessionId: number,
  workoutExerciseId: number
): Promise<boolean> {
  const riga = await prisma.workoutExercise.findUnique({
    where: { id: workoutExerciseId },
    select: { workoutDayId: true },
  });
  if (!riga) return false;

  const righeDelGiorno = await prisma.workoutExercise.findMany({
    where: { workoutDayId: riga.workoutDayId },
    orderBy: { order: 'asc' as const },
    select: { id: true, linkedToPrevious: true },
  });
  if (righeDelGiorno.length === 0) return false;

  const completati = await prisma.completedExercise.findMany({
    where: {
      sessionId,
      workoutExerciseId: {
        in: righeDelGiorno.map((r: { id: number }) => r.id),
      },
    },
    select: { workoutExerciseId: true },
  });

  const fatti = new Set(
    completati.map((c: { workoutExerciseId: number }) => c.workoutExerciseId)
  );

  return dividiInBlocchi(righeDelGiorno).every((blocco) =>
    blocco.every((r) => fatti.has(r.id))
  );
}

/**
 * Segna un esercizio (o l'intero superset) come completato.
 *
 * Se cosi' facendo il giorno risulta terminato, la sessione viene chiusa
 * e archiviata subito, aprendone una nuova vuota. Senza questa chiusura
 * automatica, dimenticando di premere "Ricomincia" la sessione resterebbe
 * aperta per giorni e lo storico mostrerebbe allenamenti di durata assurda.
 */
export async function markExercise(userId: number, workoutExerciseId: number) {
  const session = await getOrCreateCurrentSession(userId);
  const ids = await idsDelBlocco(session.workoutId, workoutExerciseId);

  // createMany con skipDuplicates: premere due volte non genera errori,
  // e l'intero blocco viene registrato in una sola operazione.
  await prisma.completedExercise.createMany({
    data: ids.map((id) => ({ sessionId: session.id, workoutExerciseId: id })),
    skipDuplicates: true,
  });

  if (await giornoCompletato(session.id, workoutExerciseId)) {
    await prisma.workoutSession.update({
      where: { id: session.id },
      data: { completedAt: new Date() },
    });

    // La sessione nuova viene creata dal prossimo accesso: restituirla
    // gia' qui evita al client una chiamata aggiuntiva.
    const nuova = await getOrCreateCurrentSession(userId);
    return { session: nuova, giornoCompletato: true };
  }

  return { session: await getOrCreateCurrentSession(userId), giornoCompletato: false };
}

export async function unmarkExercise(userId: number, workoutExerciseId: number) {
  const session = await getOrCreateCurrentSession(userId);
  const ids = await idsDelBlocco(session.workoutId, workoutExerciseId);

  await prisma.completedExercise.deleteMany({
    where: { sessionId: session.id, workoutExerciseId: { in: ids } },
  });

  return { session: await getOrCreateCurrentSession(userId), giornoCompletato: false };
}

/**
 * Reset allenamento: NON cancella nulla.
 * Chiude la sessione corrente valorizzando completedAt e ne apre una nuova.
 * Le spunte si azzerano perche' puntano alla nuova sessione,
 * mentre gli allenamenti passati restano consultabili.
 */
export async function resetSession(userId: number) {
  const workout = await getActiveWorkoutOrFail(userId);

  const current = await prisma.workoutSession.findFirst({
    where: { userId, workoutId: workout.id, completedAt: null },
    orderBy: { startedAt: 'desc' as const },
    include: { _count: { select: { completed: true } } },
  });

  if (current) {
    if (current._count.completed === 0) {
      // Sessione vuota: riaprirne una nuova sporcherebbe lo storico
      // con allenamenti mai svolti.
      return { session: current, archived: false };
    }

    await prisma.workoutSession.update({
      where: { id: current.id },
      data: { completedAt: new Date() },
    });
  }

  const session = await prisma.workoutSession.create({
    data: { userId, workoutId: workout.id },
    include: { completed: { select: { workoutExerciseId: true, completedAt: true } } },
  });

  return { session, archived: current !== null };
}

/** Allenamenti conclusi, per lo storico. */
export async function listSessionHistory(userId: number, limit = 20) {
  return prisma.workoutSession.findMany({
    where: { userId, completedAt: { not: null } },
    orderBy: { completedAt: 'desc' as const },
    take: limit,
    select: {
      id: true,
      startedAt: true,
      completedAt: true,
      workout: { select: { id: true, name: true } },
      _count: { select: { completed: true } },
    },
  });
}
