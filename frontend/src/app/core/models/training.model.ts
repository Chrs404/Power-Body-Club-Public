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
  exercise: { id: number; name: string; muscleGroup: string };
}

export interface LatestWeight {
  exerciseId: number;
  lastWeight: number;
  previousWeight: number | null;
  delta: number | null;
  performedAt: string;
}

export interface CreateWeightLogRequest {
  exerciseId: number;
  weight: number;
  reps?: number | null;
  performedAt?: string;
  notes?: string;
}
