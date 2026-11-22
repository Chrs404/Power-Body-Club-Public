-- Versione 2.0: esercizi piramidali, pesi per serie, eliminazione automatica.

-- CreateEnum
CREATE TYPE "ExerciseKind" AS ENUM ('NORMAL', 'PYRAMID');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletionPostponedUntil" DATE;

-- AlterTable
ALTER TABLE "WorkoutExercise" ADD COLUMN     "kind" "ExerciseKind" NOT NULL DEFAULT 'NORMAL';

-- AlterTable
ALTER TABLE "WeightLog" ADD COLUMN     "setNumber" INTEGER;

-- CreateTable
CREATE TABLE "WorkoutExerciseSet" (
    "id" SERIAL NOT NULL,
    "workoutExerciseId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "reps" TEXT NOT NULL,
    "suggestedWeight" DECIMAL(6,2),

    CONSTRAINT "WorkoutExerciseSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutExerciseSet_workoutExerciseId_order_key" ON "WorkoutExerciseSet"("workoutExerciseId", "order");

-- AddForeignKey
ALTER TABLE "WorkoutExerciseSet" ADD CONSTRAINT "WorkoutExerciseSet_workoutExerciseId_fkey" FOREIGN KEY ("workoutExerciseId") REFERENCES "WorkoutExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Periodo di tolleranza per chi esiste gia'.
--
-- L'eliminazione automatica scatta 15 giorni dopo che abbonamento e scheda
-- sono entrambi scaduti. Senza questa riga, al primo avvio verrebbero
-- eliminati subito tutti i clienti scaduti da piu' di 15 giorni, senza che
-- l'istruttore li abbia mai visti nell'elenco "In eliminazione".
-- Cosi' invece nessuno viene eliminato prima di 15 giorni da oggi.
UPDATE "User"
  SET "deletionPostponedUntil" = CURRENT_DATE + 15
  WHERE "role" = 'CLIENT' AND "deletionPostponedUntil" IS NULL;
