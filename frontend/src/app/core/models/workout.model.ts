import { Exercise, MuscleGroup } from './exercise.model';

export type WorkoutStatus = 'ACTIVE' | 'ARCHIVED';

/** NORMAL: stesse ripetizioni e peso per ogni serie. PYRAMID: ogni serie ha i suoi. */
export type ExerciseKind = 'NORMAL' | 'PYRAMID';

/** Una serie di un esercizio piramidale. */
export interface PyramidSet {
  order: number;
  reps: string;
  suggestedWeight: string | number | null;
}

export interface WorkoutExercise {
  id: number;
  exerciseId: number;
  order: number;
  sets: number;
  reps: string;
  restSeconds: number;
  suggestedWeight: string | number | null;
  notes: string | null;
  /** Superset: eseguito di fila con l'esercizio precedente. */
  linkedToPrevious: boolean;
  /** Assente nelle risposte dei server precedenti alla 2.0: vale NORMAL. */
  kind?: ExerciseKind;
  /** Serie della piramidale, in ordine; vuoto per gli esercizi normali. */
  pyramidSets?: PyramidSet[];
  exercise: Pick<
    Exercise,
    'id' | 'name' | 'description' | 'imageUrl' | 'videoUrl'
  > & { muscleGroup: MuscleGroup };
}

export interface WorkoutDay {
  id: number;
  label: string;
  order: number;
  exercises: WorkoutExercise[];
}

export interface WorkoutSummary {
  id: number;
  name: string;
  status: WorkoutStatus;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
  user?: { id: number; firstName: string | null; lastName: string | null; username: string };
  _count?: { days: number };
}

export interface Workout extends WorkoutSummary {
  userId: number;
  days: WorkoutDay[];
}

export interface WorkoutExerciseInput {
  exerciseId: number;
  sets: number;
  reps: string;
  restSeconds?: number;
  suggestedWeight?: number | null;
  notes?: string;
  linkedToPrevious?: boolean;
  kind?: ExerciseKind;
  pyramidSets?: { reps: string; suggestedWeight?: number | null }[];
}

export interface WorkoutDayInput {
  label: string;
  exercises: WorkoutExerciseInput[];
}

/** Scheda rapida: un modello riutilizzabile, senza cliente ne' periodo. */
export interface WorkoutTemplate {
  id: number;
  name: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { days: number };
  days: { id: number; label: string; _count: { exercises: number } }[];
}

export interface CreateTemplateRequest {
  name: string;
  notes?: string;
  days: WorkoutDayInput[];
}

export interface AssignTemplateRequest {
  userId: number;
  name?: string;
  startDate?: string;
  endDate?: string;
}

export interface CreateWorkoutRequest {
  userId: number;
  name: string;
  startDate: string;
  endDate?: string;
  notes?: string;
  days: WorkoutDayInput[];
}

export interface UpdateWorkoutRequest {
  name?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
  days?: WorkoutDayInput[];
}

/**
 * Blocco di esecuzione: un esercizio singolo o un superset.
 * Non esiste nel database, viene ricavato dalla sequenza di
 * linkedToPrevious. Il capogruppo detta giri e recupero.
 */
export interface WorkoutBlock {
  capogruppo: WorkoutExercise;
  esercizi: WorkoutExercise[];
  superset: boolean;
  /** Sigla mostrata all'utente: A, B, C... solo per i superset. */
  sigla: string | null;
}

/** Divide gli esercizi di un giorno nei blocchi che li compongono. */
export function dividiInBlocchi(esercizi: WorkoutExercise[]): WorkoutBlock[] {
  const gruppi: WorkoutExercise[][] = [];

  for (const [indice, ex] of esercizi.entries()) {
    if (indice === 0 || !ex.linkedToPrevious) {
      gruppi.push([ex]);
    } else {
      gruppi[gruppi.length - 1].push(ex);
    }
  }

  let contatoreSuperset = 0;
  return gruppi.map((gruppo) => {
    const superset = gruppo.length > 1;
    const sigla = superset
      ? String.fromCharCode(65 + contatoreSuperset++)
      : null;
    return { capogruppo: gruppo[0], esercizi: gruppo, superset, sigla };
  });
}

/**
 * Riordina gli esercizi di un giorno raccogliendoli per gruppo muscolare.
 *
 * Regole, identiche a quelle del PDF (backend/src/utils/superset.ts):
 * - le sezioni compaiono nell'ordine in cui compare il loro primo esercizio;
 * - dentro una sezione resta l'ordine scelto dall'istruttore;
 * - un superset si sposta sempre intero, e appartiene al gruppo del suo
 *   primo esercizio: spezzarlo per gruppo romperebbe il collegamento.
 *
 * Il riordino e' stabile e ripeterlo non cambia nulla: su una lista gia'
 * ordinata restituisce la stessa sequenza.
 */
export function ordinaPerGruppoMuscolare<T extends { linkedToPrevious: boolean }>(
  righe: T[],
  gruppoDi: (riga: T) => string
): T[] {
  const blocchi: T[][] = [];
  for (const [indice, riga] of righe.entries()) {
    if (indice === 0 || !riga.linkedToPrevious) {
      blocchi.push([riga]);
    } else {
      blocchi[blocchi.length - 1].push(riga);
    }
  }

  const perGruppo = new Map<string, T[][]>();
  for (const blocco of blocchi) {
    const gruppo = gruppoDi(blocco[0]);
    const lista = perGruppo.get(gruppo) ?? [];
    lista.push(blocco);
    perGruppo.set(gruppo, lista);
  }

  // Una Map conserva l'ordine di inserimento: e' gia' l'ordine di prima comparsa.
  return [...perGruppo.values()].flat(2);
}
