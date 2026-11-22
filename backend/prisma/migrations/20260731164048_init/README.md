Migrazione iniziale.

`migration.sql` crea l'intero database com'era alla prima versione ed e'
stato ricostruito dallo schema (nel repository mancava). Serve solo per i
database nuovi, per esempio quello di Docker in locale: sul database di
produzione le tabelle esistono gia' e non va eseguito.
