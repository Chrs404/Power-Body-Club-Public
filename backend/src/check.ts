/**
 * Diagnostica dell'ambiente backend.
 * Esecuzione:  npm run check
 *
 * Verifica in sequenza: dipendenze installate, variabili d'ambiente,
 * client Prisma generato, connessione al database e dati del seed.
 * Si ferma al primo errore bloccante indicando come risolverlo.
 */
import dotenv from 'dotenv';

dotenv.config();

let failures = 0;

function ok(label: string, detail = ''): void {
  console.log(`  [OK]     ${label}${detail ? ' -> ' + detail : ''}`);
}

function fail(label: string, fix: string): void {
  failures++;
  console.log(`  [ERRORE] ${label}`);
  console.log(`           Soluzione: ${fix}`);
}

async function main(): Promise<void> {
  console.log('\n=== Diagnostica backend ===\n');

  // 1. Dipendenze
  const required = ['express', 'cors', 'dotenv', 'bcryptjs', 'jsonwebtoken', 'zod'];
  const missing: string[] = [];
  for (const pkg of required) {
    try {
      require.resolve(pkg);
    } catch {
      missing.push(pkg);
    }
  }
  if (missing.length === 0) {
    ok('Dipendenze installate', required.length + ' pacchetti');
  } else {
    fail(
      'Dipendenze mancanti: ' + missing.join(', '),
      'esegui "npm install" nella cartella backend'
    );
  }

  // 2. Variabili d'ambiente
  for (const key of ['DATABASE_URL', 'JWT_SECRET']) {
    if (process.env[key]) {
      ok('Variabile ' + key);
    } else {
      fail(
        'Variabile ' + key + ' mancante',
        'verifica che backend/.env esista e che il comando parta da backend/'
      );
    }
  }

  if (process.env.DATABASE_URL) {
    const port = process.env.DATABASE_URL.match(/:(\d+)\//)?.[1];
    if (port === '5432') {
      ok('Porta database', '5432');
    } else {
      console.log(`  [ATTENZIONE] La porta nel DATABASE_URL e' ${port}, non 5432.`);
      console.log("           Corretto solo se hai scelto una porta diversa durante l'installazione.");
    }
  }

  // 3. Client Prisma
  // Non basta require.resolve: il pacchetto esiste sempre, ma va in errore
  // all'istanziazione finche' "prisma generate" non e' stato eseguito.
  let prisma: any;
  try {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
    ok('Client Prisma generato');
  } catch {
    fail('Client Prisma non generato', 'esegui "npx prisma generate"');
    console.log('\n=== ' + failures + ' problemi da risolvere ===\n');
    process.exit(1);
  }

  if (failures > 0) {
    console.log('\n=== ' + failures + ' problemi da risolvere ===\n');
    process.exit(1);
  }

  // 4. Connessione e dati
  try {
    await prisma.$queryRaw`SELECT 1`;
    ok('Connessione al database');

    const users = await prisma.user.count();
    const exercises = await prisma.exercise.count();
    const schedules = await prisma.gymSchedule.count();

    if (users === 0) {
      fail('Nessun utente nel database', 'esegui "npm run prisma:seed"');
    } else {
      ok('Utenti', String(users));
      const trainer = await prisma.user.findFirst({ where: { role: 'TRAINER' } });
      if (trainer) {
        ok('Istruttore presente', 'username "' + trainer.username + '"');
      } else {
        fail('Nessun istruttore', 'esegui "npm run prisma:seed"');
      }
    }

    ok('Esercizi', String(exercises));
    ok('Fasce orarie', String(schedules));
  } catch (error) {
    fail(
      'Connessione al database fallita',
      'verifica che il servizio postgresql-x64-16 sia avviato (services.msc)'
    );
    console.log('\n  Dettaglio:', error instanceof Error ? error.message : error);
  } finally {
    await prisma.$disconnect();
  }

  console.log('');
  if (failures === 0) {
    console.log('=== Tutto a posto. Avvia con "npm run dev" ===\n');
  } else {
    console.log('=== ' + failures + ' problemi da risolvere ===\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Diagnostica fallita:', error);
  process.exit(1);
});
