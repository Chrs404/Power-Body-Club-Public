import { prisma } from '../prisma/client';
import { TransactionClient } from '../prisma/transaction';
import { parseDateOnly, todayUtc } from '../utils/date';
import { badRequest } from '../utils/app-error';
import { CreateWeightLogInput, WeightHistoryQuery } from '../schemas/training.schema';

/**
 * Registrazioni conservate per ogni coppia cliente-esercizio.
 *
 * Le piu' vecchie vengono eliminate dal database al momento di ogni
 * nuovo salvataggio, non solo nascoste: lo storico serve a vedere
 * l'andamento recente, e tenere anni di righe che nessuno consulta
 * appesantirebbe il database senza dare nulla in cambio.
 */
export const REGISTRAZIONI_PER_ESERCIZIO = 10;

/** Dalla piu' recente alla piu' vecchia; a parita' di giorno vince l'ultima inserita. */
const dallaPiuRecente = [
  { performedAt: 'desc' as const },
  { createdAt: 'desc' as const },
  { id: 'desc' as const },
];

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

  // Salvataggio e pulizia nella stessa transazione: se la pulizia
  // fallisse, anche la nuova registrazione verrebbe annullata, invece di
  // lasciare una riga in piu' che nessuno rimuoverebbe piu'.
  return prisma.$transaction(async (tx: TransactionClient) => {
    const creato = await tx.weightLog.create({
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

    await eliminaRegistrazioniInEccesso(tx, userId, input.exerciseId);
    return creato;
  });
}

/**
 * Tiene le ultime REGISTRAZIONI_PER_ESERCIZIO registrazioni del cliente
 * per quell'esercizio ed elimina le altre. Tocca solo l'esercizio appena
 * registrato: gli altri vengono puliti al loro prossimo salvataggio.
 */
async function eliminaRegistrazioniInEccesso(
  tx: TransactionClient,
  userId: number,
  exerciseId: number
): Promise<void> {
  const daTenere = await tx.weightLog.findMany({
    where: { userId, exerciseId },
    orderBy: dallaPiuRecente,
    take: REGISTRAZIONI_PER_ESERCIZIO,
    select: { id: true },
  });

  await tx.weightLog.deleteMany({
    where: { userId, exerciseId, id: { notIn: daTenere.map((r) => r.id) } },
  });
}

/**
 * Storico dei pesi: le ultime registrazioni di OGNI esercizio.
 *
 * Prima il limite era complessivo (50 righe sommando tutti gli
 * esercizi): con l'uso, gli esercizi meno frequenti sparivano dallo
 * storico e i grafici si accorciavano, anche se i dati c'erano ancora.
 * Ora il limite vale per esercizio, quindi ognuno ha sempre le sue.
 *
 * `limit`, se indicato, puo' solo ridurre il numero per esercizio.
 */
export async function listWeightLogs(userId: number, query: WeightHistoryQuery) {
  const perEsercizio = Math.min(
    query.limit ?? REGISTRAZIONI_PER_ESERCIZIO,
    REGISTRAZIONI_PER_ESERCIZIO
  );

  // Dopo la pulizia le righe per cliente sono al massimo dieci per
  // esercizio: leggerle tutte e tagliare qui resta leggero. Il taglio
  // serve comunque per i dati salvati prima che la pulizia esistesse.
  const tutte = await prisma.weightLog.findMany({
    where: {
      userId,
      ...(query.exerciseId ? { exerciseId: query.exerciseId } : {}),
    },
    orderBy: dallaPiuRecente,
    include: { exercise: { select: { id: true, name: true, muscleGroup: true } } },
  });

  const contate = new Map<number, number>();
  return tutte.filter((log) => {
    const n = contate.get(log.exerciseId) ?? 0;
    contate.set(log.exerciseId, n + 1);
    return n < perEsercizio;
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
  // Nessun limite complessivo: con "take: 300" un esercizio non
  // registrato nelle ultime 300 righe perdeva l'indicazione dell'ultimo
  // peso. Con dieci righe al massimo per esercizio non serve.
  const logs = await prisma.weightLog.findMany({
    where: { userId },
    orderBy: dallaPiuRecente,
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
