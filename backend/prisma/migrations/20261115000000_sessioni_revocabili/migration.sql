-- Sessioni revocabili.
--
-- Data dell'ultimo cambio o reset della password: i token emessi prima
-- vengono respinti. Nullable e senza valore predefinito: per gli utenti
-- esistenti resta NULL, quindi nessuna sessione aperta viene chiusa
-- dall'aggiornamento.

ALTER TABLE "User"
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
