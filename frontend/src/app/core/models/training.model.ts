export interface CompletedExercise {
  workoutExerciseId: number;
  completedAt: string;
}

export interface TrainingSession {
  id: number;
  workoutId: number;
  startedAt: string;
  completedAt: string | null;
  completed: CompletedExercise[];
}

export interface SessionHistoryItem {
  id: number;
  startedAt: string;
  completedAt: string | null;
  workout: { id: number; name: string };
  _count: { completed: number };
}

export interface WeightLog {
  id: number;
  exerciseId: number;
  weight: string | number;
  reps: number | null;
  performedAt: string;
  notes: string | null;
  /** Numero della serie per le piramidali (1, 2, 3...); null negli altri casi. */
  setNumber: number | null;
  exercise: { id: number; name: string; muscleGroup: string };
}

export interface LatestWeight {
  exerciseId: number;
  lastWeight: number;
  previousWeight: number | null;
  delta: number | null;
  performedAt: string;
  /** Serie dell'ultima registrazione piramidale; vuoto per i pesi normali. */
  lastSets?: { setNumber: number; weight: number; reps: number | null }[];
  /** Serie della registrazione precedente a quella sopra. */
  previousSets?: { setNumber: number; weight: number; reps: number | null }[];
}

export interface CreateWeightLogRequest {
  exerciseId: number;
  weight: number;
  reps?: number | null;
  performedAt?: string;
  notes?: string;
  setNumber?: number | null;
}

export interface UpdateWeightLogRequest {
  weight?: number;
  reps?: number | null;
  performedAt?: string;
  notes?: string;
}
