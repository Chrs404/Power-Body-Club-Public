export type MuscleGroup =
  | 'QUADRICEPS'
  | 'ADDUCTORS'
  | 'ABDUCTORS'
  | 'HAMSTRINGS'
  | 'CALVES'
  | 'LATS'
  | 'CHEST'
  | 'DELTOIDS'
  | 'TRAPS'
  | 'TRICEPS'
  | 'BICEPS'
  | 'FOREARMS'
  | 'GLUTES'
  | 'ABS'
  | 'LOWER_BACK'
  | 'CARDIO';

/**
 * Etichette mostrate all'utente.
 * L'ordine di questo oggetto determina anche l'ordine con cui i
 * gruppi compaiono nel catalogo e nel selettore degli esercizi.
 */
export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  QUADRICEPS: 'Quadricipiti',
  ADDUCTORS: 'Adduttori',
  ABDUCTORS: 'Abduttori',
  HAMSTRINGS: 'Femorali',
  CALVES: 'Polpacci',
  LATS: 'Dorsali',
  CHEST: 'Pettorali',
  DELTOIDS: 'Deltoidi',
  TRAPS: 'Trapezi',
  TRICEPS: 'Tricipiti',
  BICEPS: 'Bicipiti',
  FOREARMS: 'Avambracci',
  GLUTES: 'Glutei',
  ABS: 'Addome',
  LOWER_BACK: 'Lombari',
  CARDIO: 'Cardio',
};

export const MUSCLE_GROUPS = Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[];

export interface Exercise {
  id: number;
  name: string;
  description: string | null;
  muscleGroup: MuscleGroup;
  imageUrl: string | null;
  videoUrl: string | null;
  isActive: boolean;
}

export interface ExerciseInput {
  name: string;
  muscleGroup: MuscleGroup;
  description?: string;
  imageUrl?: string;
  videoUrl?: string;
  isActive?: boolean;
}
