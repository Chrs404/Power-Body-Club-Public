import app from './app';
import { env } from './config/env';
import { prisma } from './prisma/client';
import { avviaKeepAlive } from './utils/keep-alive';

async function bootstrap(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('Database connesso');

    const server = app.listen(env.port, () => {
      console.log('');
      console.log('  Server avviato');
      console.log(`  API:      http://localhost:${env.port}/api`);
      console.log(`  Health:   http://localhost:${env.port}/api/health`);
      console.log(`  Login:    POST http://localhost:${env.port}/api/auth/login`);
      console.log(`  Ambiente: ${env.nodeEnv}`);
      console.log('');
    });

    // Attivo solo se KEEP_ALIVE_URL e' impostata: vedi utils/keep-alive.ts
    const keepAlive = avviaKeepAlive();

    const shutdown = async (signal: string) => {
      console.log(`\n${signal} ricevuto, chiusura in corso...`);
      if (keepAlive) clearInterval(keepAlive);
      server.close(async () => {
        await prisma.$disconnect();
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    console.error('');
    console.error('  AVVIO FALLITO');
    console.error('');
    console.error(error);
    console.error('');
    console.error('  Controlla, in ordine:');
    console.error('  1. il servizio PostgreSQL e\' avviato (services.msc -> postgresql-x64-16)');
    console.error('  2. DATABASE_URL in backend/.env punta alla porta 5432');
    console.error('  3. utente e password corrispondono a quelli creati con database/setup.sql');
    console.error('');
    await prisma.$disconnect();
    process.exit(1);
  }
}

bootstrap();
