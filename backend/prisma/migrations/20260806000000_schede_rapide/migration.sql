-- Schede rapide (modelli riutilizzabili).
--
-- Una colonna con valore predefinito: le schede esistenti restano
-- schede normali senza alcuna trasformazione dei dati.

ALTER TABLE "Workout"
  ADD COLUMN "isTemplate" BOOLEAN NOT NULL DEFAULT false;

-- L'elenco dei modelli e' ordinato per nome: l'indice evita di scorrere
-- tutte le schede di tutti i clienti per trovarli.
CREATE INDEX "Workout_isTemplate_name_idx" ON "Workout"("isTemplate", "name");
