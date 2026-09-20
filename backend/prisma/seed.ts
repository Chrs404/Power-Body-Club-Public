import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/password';

// Necessario per poter lanciare il seed anche direttamente con
// "npx tsx prisma/seed.ts": in quel caso, a differenza di
// "prisma db seed", nessuno ha gia' caricato il file .env.
dotenv.config();

const prisma = new PrismaClient();

// Credenziali dell'istruttore.
// In produzione vanno passate da variabili d'ambiente: scriverle nel codice
// significa pubblicarle, se il repository e' visibile.
// In locale i valori di ripiego vanno benissimo.
const TRAINER_USERNAME = process.env.TRAINER_USERNAME ?? 'istruttore';
const TRAINER_PASSWORD = process.env.TRAINER_PASSWORD ?? 'Palestra2026!';

if (process.env.NODE_ENV === 'production' && !process.env.TRAINER_PASSWORD) {
  console.error(
    '\nRifiuto di eseguire il seed in produzione con la password predefinita.' +
      '\nImposta la variabile TRAINER_PASSWORD prima di procedere.\n'
  );
  process.exit(1);
}

const WEEKDAY_SCHEDULE = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
] as const;

const EXERCISES = [
  { name: 'Squat', muscleGroup: 'QUADRICEPS', description: 'Bilanciere alto, discesa controllata.' },
  { name: 'Leg press', muscleGroup: 'QUADRICEPS', description: 'Pressa a 45 gradi.' },
  { name: 'Leg extension', muscleGroup: 'QUADRICEPS', description: 'Isolamento del quadricipite.' },
  { name: 'Affondi con manubri', muscleGroup: 'QUADRICEPS', description: 'Passo alternato.' },
  { name: 'Adductor machine', muscleGroup: 'ADDUCTORS', description: 'Chiusura delle gambe alla macchina.' },
  { name: 'Abductor machine', muscleGroup: 'ABDUCTORS', description: 'Apertura delle gambe alla macchina.' },
  { name: 'Leg curl', muscleGroup: 'HAMSTRINGS', description: 'Flessione delle gambe da prono.' },
  { name: 'Stacco rumeno', muscleGroup: 'HAMSTRINGS', description: 'Gambe semitese, focus femorali.' },
  { name: 'Calf raise in piedi', muscleGroup: 'CALVES', description: 'Sollevamento sui talloni.' },
  { name: 'Calf raise da seduto', muscleGroup: 'CALVES', description: 'Enfasi sul soleo.' },
  { name: 'Trazioni alla sbarra', muscleGroup: 'LATS', description: 'Presa prona, ampiezza media.' },
  { name: 'Lat machine', muscleGroup: 'LATS', description: 'Tirata al petto a presa larga.' },
  { name: 'Rematore con bilanciere', muscleGroup: 'LATS', description: 'Busto inclinato, schiena neutra.' },
  { name: 'Pulley basso', muscleGroup: 'LATS', description: 'Tirata orizzontale ai cavi.' },
  { name: 'Panca piana', muscleGroup: 'CHEST', description: 'Distensioni su panca piana con bilanciere.' },
  { name: 'Panca inclinata', muscleGroup: 'CHEST', description: 'Enfasi sul petto alto.' },
  { name: 'Croci ai cavi', muscleGroup: 'CHEST', description: 'Isolamento pettorali ai cavi.' },
  { name: 'Lento avanti', muscleGroup: 'DELTOIDS', description: 'Distensioni sopra la testa.' },
  { name: 'Alzate laterali', muscleGroup: 'DELTOIDS', description: 'Isolamento deltoide laterale.' },
  { name: 'Alzate posteriori', muscleGroup: 'DELTOIDS', description: 'Isolamento deltoide posteriore.' },
  { name: 'Scrollate con manubri', muscleGroup: 'TRAPS', description: 'Sollevamento delle spalle.' },
  { name: 'Tirate al mento', muscleGroup: 'TRAPS', description: 'Presa stretta, gomiti alti.' },
  { name: 'French press', muscleGroup: 'TRICEPS', description: 'Estensioni sopra la testa.' },
  { name: 'Push down ai cavi', muscleGroup: 'TRICEPS', description: 'Estensioni con corda.' },
  { name: 'Dip alle parallele', muscleGroup: 'TRICEPS', description: 'Busto verticale.' },
  { name: 'Curl con bilanciere', muscleGroup: 'BICEPS', description: 'Presa supina, gomiti fermi.' },
  { name: 'Curl con manubri', muscleGroup: 'BICEPS', description: 'Esecuzione alternata.' },
  { name: 'Curl a martello', muscleGroup: 'BICEPS', description: 'Presa neutra.' },
  { name: 'Curl ai polsi', muscleGroup: 'FOREARMS', description: 'Flessione dei polsi con bilanciere.' },
  { name: 'Farmer walk', muscleGroup: 'FOREARMS', description: 'Camminata con manubri pesanti.' },
  { name: 'Hip thrust', muscleGroup: 'GLUTES', description: 'Spinta di bacino con bilanciere.' },
  { name: 'Glute bridge', muscleGroup: 'GLUTES', description: 'Ponte a terra.' },
  { name: 'Crunch a terra', muscleGroup: 'ABS', description: 'Flessione del busto.' },
  { name: 'Plank', muscleGroup: 'ABS', description: 'Tenuta isometrica sugli avambracci.' },
  { name: 'Leg raise', muscleGroup: 'ABS', description: 'Sollevamento gambe da sospeso o a terra.' },
  { name: 'Iperestensioni', muscleGroup: 'LOWER_BACK', description: 'Estensione del busto alla panca.' },
  { name: 'Good morning', muscleGroup: 'LOWER_BACK', description: 'Flessione del busto con bilanciere.' },
  { name: 'Tapis roulant', muscleGroup: 'CARDIO', description: 'Corsa o camminata in pendenza.' },
  { name: 'Cyclette', muscleGroup: 'CARDIO', description: 'Pedalata a resistenza regolabile.' },
  { name: 'Vogatore', muscleGroup: 'CARDIO', description: 'Trazione completa a corpo libero.' },
] as const;

async function main(): Promise<void> {
  console.log('Seed avviato...');

  // Istruttore. upsert rende il seed rieseguibile senza errori di duplicato.
  const passwordHash = await hashPassword(TRAINER_PASSWORD);

  const trainer = await prisma.user.upsert({
    where: { username: TRAINER_USERNAME },
    update: {},
    create: {
      username: TRAINER_USERNAME,
      passwordHash,
      role: 'TRAINER',
      firstName: 'Istruttore',
      lastName: 'Palestra',
      // false: l'istruttore non passa dal flusso di primo accesso.
      mustChangePassword: false,
    },
  });
  console.log(`Istruttore pronto (id ${trainer.id}, username "${trainer.username}")`);

  // Orari settimanali: lun-ven 07:00-22:00, sabato 09:00-13:00, domenica chiusa.
  for (const day of WEEKDAY_SCHEDULE) {
    await prisma.gymSchedule.upsert({
      where: { dayOfWeek_order: { dayOfWeek: day, order: 0 } },
      update: {},
      create: { dayOfWeek: day, order: 0, openTime: '07:00', closeTime: '22:00' },
    });
  }
  await prisma.gymSchedule.upsert({
    where: { dayOfWeek_order: { dayOfWeek: 'SATURDAY', order: 0 } },
    update: {},
    create: { dayOfWeek: 'SATURDAY', order: 0, openTime: '09:00', closeTime: '13:00' },
  });
  console.log('Orari settimanali impostati (domenica chiusa)');

  // Catalogo esercizi iniziale.
  let created = 0;
  for (const exercise of EXERCISES) {
    await prisma.exercise.upsert({
      where: {
        name_muscleGroup: { name: exercise.name, muscleGroup: exercise.muscleGroup },
      },
      update: {},
      create: {
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        description: exercise.description,
      },
    });
    created++;
  }
  console.log(`Catalogo esercizi: ${created} esercizi disponibili`);

  console.log('\nSeed completato.');
  console.log(`Credenziali istruttore -> username: ${TRAINER_USERNAME} / password: ${TRAINER_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error('\n--- SEED FALLITO ---');
    console.error(error);
    if (error instanceof Error && error.stack) {
      console.error('\nStack:\n' + error.stack);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
