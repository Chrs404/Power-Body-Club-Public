-- Aggiornamento del database di produzione (Neon) alla versione 2.0.
--
-- Da eseguire nella SQL Editor di Neon PRIMA di pubblicare il backend 2.0.
-- Si puo' rieseguire senza danni: ogni istruzione controlla se e' gia'
-- stata applicata.

-- 1. Sessioni revocabili: data dell'ultimo cambio password.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);

-- 2. Esercizi piramidali: tipo di esercizio e tabella delle serie.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExerciseKind') THEN
    CREATE TYPE "ExerciseKind" AS ENUM ('NORMAL', 'PYRAMID');
  END IF;
END $$;

ALTER TABLE "WorkoutExercise"
  ADD COLUMN IF NOT EXISTS "kind" "ExerciseKind" NOT NULL DEFAULT 'NORMAL';

CREATE TABLE IF NOT EXISTS "WorkoutExerciseSet" (
    "id" SERIAL NOT NULL,
    "workoutExerciseId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "reps" TEXT NOT NULL,
    "suggestedWeight" DECIMAL(6,2),

    CONSTRAINT "WorkoutExerciseSet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkoutExerciseSet_workoutExerciseId_order_key"
  ON "WorkoutExerciseSet"("workoutExerciseId", "order");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WorkoutExerciseSet_workoutExerciseId_fkey'
  ) THEN
    ALTER TABLE "WorkoutExerciseSet"
      ADD CONSTRAINT "WorkoutExerciseSet_workoutExerciseId_fkey"
      FOREIGN KEY ("workoutExerciseId") REFERENCES "WorkoutExercise"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 3. Pesi per serie (piramidali): numero della serie nella registrazione.
ALTER TABLE "WeightLog"
  ADD COLUMN IF NOT EXISTS "setNumber" INTEGER;

-- 4. Eliminazione automatica: data prima della quale un cliente non va eliminato.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "deletionPostponedUntil" DATE;

-- Periodo di tolleranza: nessun cliente esistente viene eliminato prima di
-- 15 giorni da quando si esegue questo script, cosi' l'istruttore fa in
-- tempo a vederli nell'elenco "In eliminazione". Rieseguendo lo script
-- la data di chi l'ha gia' non cambia.
UPDATE "User"
  SET "deletionPostponedUntil" = CURRENT_DATE + 15
  WHERE "role" = 'CLIENT' AND "deletionPostponedUntil" IS NULL;
