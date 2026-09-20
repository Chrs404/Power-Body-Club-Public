-- Setup iniziale del database.
-- Da eseguire UNA SOLA VOLTA, connessi come superuser "postgres".
--
-- Esecuzione:
--   psql -U postgres -h localhost -p 5432 -f database/setup.sql
--
-- Ti verra' chiesta la password del superuser scelta durante l'installazione.

-- CREATEDB non e' opzionale: "prisma migrate dev" crea un database
-- temporaneo (shadow database) per validare le migrazioni.
-- Senza questo permesso la Fase 2 fallisce.
CREATE USER gym_user WITH PASSWORD 'gym_password' CREATEDB;

CREATE DATABASE gym_db OWNER gym_user;

\c gym_db

-- Da PostgreSQL 15 lo schema "public" non e' piu' scrivibile da tutti
-- per default: essere proprietari del database non basta.
-- Senza queste due righe Prisma fallisce con
-- "permission denied for schema public".
GRANT ALL ON SCHEMA public TO gym_user;
ALTER SCHEMA public OWNER TO gym_user;

SELECT 'Setup completato' AS esito;
