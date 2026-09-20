import { Exercise, MuscleGroup } from './exercise.model';

export type WorkoutStatus = 'ACTIVE' | 'ARCHIVED';

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
