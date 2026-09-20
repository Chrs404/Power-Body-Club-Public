/**
 * Cambia la password di un utente dalla riga di comando.
 *
 * Serve soprattutto per l'istruttore, che non ha una schermata di
 * cambio password nell'app, e per riparare un account bloccato.
 *
 * Uso:
 *   npm run set-password -- istruttore NuovaPassword123
 *
 * Agisce sul database indicato da DATABASE_URL: verifica di puntare
 * a quello giusto prima di eseguirlo.
 */
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../utils/password';

dotenv.config();

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const [username, password] = process.argv.slice(2);

  if (!username || !password) {
    console.error('\nUso: npm run set-password -- <username> <nuova-password>\n');
    process.exit(1);
  }

  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    console.error(
      '\nLa password deve contenere almeno 8 caratteri, una lettera e un numero.' +
        '\nSono le stesse regole applicate dall\'app.\n'
    );
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { username: username.trim().toLowerCase() },
  });

  if (!user) {
    console.error(`\nNessun utente con username "${username}".\n`);
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(password),
      // L'istruttore non deve passare dal flusso di primo accesso,
      // pensato per i clienti.
      mustChangePassword: user.role === 'CLIENT',
    },
  });

  const host = process.env.DATABASE_URL?.match(/@([^/:]+)/)?.[1] ?? 'sconosciuto';

  console.log(`\nPassword aggiornata per "${user.username}" (${user.role}).`);
  console.log(`Database: ${host}`);
  if (user.role === 'CLIENT') {
    console.log('Al prossimo accesso dovrà impostarne una propria.');
  }
  console.log('');
}

main()
  .catch((error) => {
    console.error('\nOperazione fallita:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
