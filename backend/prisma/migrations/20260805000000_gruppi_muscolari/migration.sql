-- Nuovo elenco dei gruppi muscolari.
--
-- Un enum di PostgreSQL non puo' perdere valori ancora usati dalle righe:
-- serve quindi creare un tipo nuovo, convertire i dati e sostituire
-- il vecchio. La conversione avviene in un'unica istruzione ALTER,
-- quindi non esiste un istante in cui la tabella resta senza valori validi.

CREATE TYPE "MuscleGroup_new" AS ENUM (
  'QUADRICEPS', 'ADDUCTORS', 'ABDUCTORS', 'HAMSTRINGS',
  'CALVES', 'LATS', 'CHEST', 'DELTOIDS',
  'TRAPS', 'TRICEPS', 'BICEPS', 'FOREARMS',
  'GLUTES', 'ABS', 'LOWER_BACK', 'CARDIO'
);

-- Conversione dei valori esistenti.
--   BACK      -> LATS        (la schiena diventa il gruppo dorsali)
--   SHOULDERS -> DELTOIDS
--   LEGS      -> QUADRICEPS  (gruppo piu' rappresentativo fra quelli nuovi)
--   FULL_BODY -> CARDIO      (non ha un corrispondente: e' il piu' vicino)
-- Gli altri valori restano invariati perche' esistono anche nel nuovo elenco.
ALTER TABLE "Exercise"
  ALTER COLUMN "muscleGroup" TYPE "MuscleGroup_new"
  USING (
    CASE "muscleGroup"::text
      WHEN 'BACK'      THEN 'LATS'
      WHEN 'SHOULDERS' THEN 'DELTOIDS'
      WHEN 'LEGS'      THEN 'QUADRICEPS'
      WHEN 'FULL_BODY' THEN 'CARDIO'
      ELSE "muscleGroup"::text
    END
  )::"MuscleGroup_new";

DROP TYPE "MuscleGroup";

ALTER TYPE "MuscleGroup_new" RENAME TO "MuscleGroup";
