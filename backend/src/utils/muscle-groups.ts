/**
 * Etichette italiane dei gruppi muscolari.
 *
 * Duplicano quelle del frontend, ma servono qui perche' il PDF viene
 * generato sul server: i codici sono in inglese nel database e in un
 * documento stampato devono comparire in italiano.
 */
export const MUSCLE_GROUP_LABELS: Record<string, string> = {
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
