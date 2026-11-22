import { prisma } from '../prisma/client';
import { TransactionClient } from '../prisma/transaction';
import { parseDateOnly, todayUtc } from '../utils/date';
import { badRequest, notFound } from '../utils/app-error';
import {
  CreateWeightLogInput,
  UpdateWeightLogInput,
  WeightHistoryQuery,
} from '../schemas/training.schema';

/**
 * Registrazioni conservate per ogni coppia cliente-esercizio.
 *
 * Le piu' vecchie vengono eliminate dal database al momento di ogni
 * nuovo salvataggio, non solo nascoste: lo storico serve a vedere
 * l'andamento recente, e tenere anni di righe che nessuno consulta
 * appesantirebbe il database senza dare nulla in cambio.
 *
 * Una "registrazione" non coincide sempre con una riga: per una
 * piramidale le serie dello stesso giorno ne formano una sola
 * (vedi chiaveRegistrazione), altrimenti quattro serie consumerebbero
 * quattro dei dieci posti e lo storico coprirebbe due allenamenti e mezzo.
 */
export const REGISTRAZIONI_PER_ESERCIZIO = 10;

/**
 * Identifica la registrazione a cui appartiene una riga.
 *
 * - Peso normale: ogni riga e' una registrazione a se'.
 * - Serie di una piramidale: tutte le serie dello stesso giorno sono la
 *   stessa registrazione.
 */
function chiaveRegistrazione(riga: {
  id: number;
  performedAt: Date;
  setNumber: number | null;
}): string {
  return riga.setNumber === null
    ? `riga:${riga.id}`
    : `piramide:${riga.performedAt.toISOString().slice(0, 10)}`;
}

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

  const performedAt = input.performedAt
    ? parseDateOnly(input.performedAt, 'data')
    : todayUtc();
  const setNumber = input.setNumber ?? null;

  // Salvataggio e pulizia nella stessa transazione: se la pulizia
  // fallisse, anche la nuova registrazione verrebbe annullata, invece di
  // lasciare una riga in piu' che nessuno rimuoverebbe piu'.
  return prisma.$transaction(async (tx: TransactionClient) => {
    if (setNumber !== null) {
      // Stessa serie, stesso giorno: il nuovo valore sostituisce il
      // precedente. Chi corregge il peso appena scritto non deve trovarsi
      // la serie registrata due volte.
      await tx.weightLog.deleteMany({
        where: { userId, exerciseId: input.exerciseId, performedAt, setNumber },
      });
    }

    const creato = await tx.weightLog.create({
      data: {
        userId,
        exerciseId: input.exerciseId,
        weight: input.weight,
        reps: input.reps ?? null,
        performedAt,
        notes: emptyToNull(input.notes),
        setNumber,
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
  const righe = await tx.weightLog.findMany({
    where: { userId, exerciseId },
    orderBy: dallaPiuRecente,
    select: { id: true, performedAt: true, setNumber: true },
  });

  // Si contano le registrazioni, non le righe: le serie di una
  // piramidale dello stesso giorno valgono per una.
  const tenute = new Set<string>();
  const daEliminare: number[] = [];

  for (const riga of righe) {
    const chiave = chiaveRegistrazione(riga);
    if (tenute.has(chiave) || tenute.size < REGISTRAZIONI_PER_ESERCIZIO) {
      tenute.add(chiave);
    } else {
      daEliminare.push(riga.id);
    }
  }

  if (daEliminare.length > 0) {
    await tx.weightLog.deleteMany({ where: { id: { in: daEliminare } } });
  }
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

  // Per ogni esercizio, le registrazioni gia' incontrate (vedi
  // chiaveRegistrazione): le serie di una piramidale contano per una.
  const viste = new Map<number, Set<string>>();
  return tutte.filter((log) => {
    const registrazioni = viste.get(log.exerciseId) ?? new Set<string>();
    viste.set(log.exerciseId, registrazioni);

    const chiave = chiaveRegistrazione(log);
    if (registrazioni.has(chiave)) return true;
    if (registrazioni.size >= perEsercizio) return false;

    registrazioni.add(chiave);
    return true;
  });
}

/**
 * Corregge una registrazione gia' salvata: peso, ripetizioni, data o note.
 *
 * L'esercizio e il numero della serie non si cambiano: una registrazione
 * finita sull'esercizio sbagliato si elimina e si rifa'.
 */
export async function updateWeightLog(
  userId: number,
  logId: number,
  input: UpdateWeightLogInput
) {
  // Il filtro su userId impedisce di modificare la registrazione di un altro.
  const esistente = await prisma.weightLog.findFirst({
    where: { id: logId, userId },
    select: { id: true },
  });

  if (!esistente) {
    throw notFound('Registrazione non trovata.');
  }

  return prisma.weightLog.update({
    where: { id: logId },
    data: {
      ...(input.weight !== undefined ? { weight: input.weight } : {}),
      ...(input.reps !== undefined ? { reps: input.reps } : {}),
      ...(input.performedAt !== undefined
        ? { performedAt: parseDateOnly(input.performedAt, 'data') }
        : {}),
      ...(input.notes !== undefined ? { notes: emptyToNull(input.notes) } : {}),
    },
    include: { exercise: { select: { id: true, name: true, muscleGroup: true } } },
  });
}

/**
 * Elimina una registrazione.
 *
 * `interaRegistrazione` riguarda le piramidali: invece della sola serie
 * indicata elimina tutte le serie di quel giorno, cioe' l'intera riga che
 * il cliente vede nello storico.
 */
export async function deleteWeightLog(
  userId: number,
  logId: number,
  interaRegistrazione = false
): Promise<void> {
  // Il filtro su userId impedisce di eliminare la registrazione di un altro.
  const riga = await prisma.weightLog.findFirst({
    where: { id: logId, userId },
    select: { id: true, exerciseId: true, performedAt: true, setNumber: true },
  });

  if (!riga) {
    throw badRequest('Registrazione non trovata.');
  }

  if (interaRegistrazione && riga.setNumber !== null) {
    await prisma.weightLog.deleteMany({
      where: {
        userId,
        exerciseId: riga.exerciseId,
        performedAt: riga.performedAt,
        setNumber: { not: null },
      },
    });
    return;
  }

  await prisma.weightLog.delete({ where: { id: riga.id } });
}

/**
 * Ultima registrazione di ciascun esercizio, con la precedente per
 * calcolare la variazione. Serve a mostrare "62.5 kg (+2.5)" accanto
 * all'esercizio nella scheda.
 *
 * Per una piramidale la registrazione e' l'insieme delle serie del
 * giorno: come valore si prende la serie piu' pesante, e in lastSets si
 * restituiscono tutte, cosi' la scheda puo' riproporre serie per serie
 * i pesi dell'ultima volta.
 */
export async function getLatestWeights(userId: number) {
  // Nessun limite complessivo: con "take: 300" un esercizio non
  // registrato nelle ultime 300 righe perdeva l'indicazione dell'ultimo
  // peso. Con dieci registrazioni al massimo per esercizio non serve.
  const logs = await prisma.weightLog.findMany({
    where: { userId },
    orderBy: dallaPiuRecente,
    select: {
      id: true,
      exerciseId: true,
      weight: true,
      reps: true,
      performedAt: true,
      setNumber: true,
    },
  });

  type Serie = { setNumber: number; weight: number; reps: number | null };
  type Registrazione = { chiave: string; massimo: number; date: Date; serie: Serie[] };

  // Per ogni esercizio bastano le due registrazioni piu' recenti.
  const perEsercizio = new Map<number, Registrazione[]>();

  for (const log of logs) {
    const peso = Number(log.weight);
    const chiave = chiaveRegistrazione(log);
    const registrazioni = perEsercizio.get(log.exerciseId) ?? [];
    perEsercizio.set(log.exerciseId, registrazioni);

    let corrente = registrazioni.find((r) => r.chiave === chiave);
    if (!corrente) {
      if (registrazioni.length >= 2) continue;
      corrente = { chiave, massimo: peso, date: log.performedAt, serie: [] };
      registrazioni.push(corrente);
    }

    corrente.massimo = Math.max(corrente.massimo, peso);
    if (log.setNumber !== null) {
      corrente.serie.push({ setNumber: log.setNumber, weight: peso, reps: log.reps });
    }
  }

  return [...perEsercizio.entries()].map(([exerciseId, [ultima, precedente]]) => ({
    exerciseId,
    lastWeight: ultima.massimo,
    previousWeight: precedente ? precedente.massimo : null,
    delta: precedente
      ? Math.round((ultima.massimo - precedente.massimo) * 100) / 100
      : null,
    performedAt: ultima.date,
    lastSets: [...ultima.serie].sort((a, b) => a.setNumber - b.setNumber),
    // Serie della registrazione precedente: mentre si compila la piramidale
    // di oggi, le serie non ancora scritte si suggeriscono da qui.
    previousSets: precedente
      ? [...precedente.serie].sort((a, b) => a.setNumber - b.setNumber)
      : [],
  }));
}
