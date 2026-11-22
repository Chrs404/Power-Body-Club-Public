import { prisma } from '../prisma/client';
import { todayUtc } from '../utils/date';
import { getUpcomingClosures, listNews } from './gym.service';
import { unauthorized } from '../utils/app-error';
import { dividiInBlocchi } from '../utils/superset';

/**
 * Il giorno della scheda da proporre nella Home: "prossimo allenamento".
 *
 * - Se c'e' un allenamento iniziato e non finito, e' quello: va ripreso.
 * - Altrimenti e' il giorno dopo l'ultimo allenamento concluso, tornando
 *   al primo dopo l'ultimo (A, B, C, A...).
 * - Senza allenamenti alle spalle, il primo giorno.
 *
 * I gruppi muscolari sono quelli degli esercizi del giorno, nell'ordine
 * in cui compaiono: servono a dire "Petto e tricipiti" senza che
 * l'istruttore debba scriverlo nel nome del giorno.
 */
export async function prossimoGiorno(userId: number, workoutId: number) {
  const giorni = await prisma.workoutDay.findMany({
    where: { workoutId },
    orderBy: { order: 'asc' as const },
    select: {
      id: true,
      label: true,
      exercises: {
        orderBy: { order: 'asc' as const },
        select: {
          id: true,
          linkedToPrevious: true,
          exercise: { select: { muscleGroup: true } },
        },
      },
    },
  });

  if (giorni.length === 0) return null;

  const descrivi = (indice: number, fatti: Set<number>) => {
    const giorno = giorni[indice];
    // Un superset si spunta una volta sola: si contano i blocchi.
    const blocchi = dividiInBlocchi(giorno.exercises);
    const blocksDone = blocchi.filter((b) => b.every((r) => fatti.has(r.id))).length;

    return {
      dayId: giorno.id,
      label: giorno.label,
      index: indice,
      muscleGroups: [...new Set(giorno.exercises.map((e) => e.exercise.muscleGroup))],
      exerciseCount: giorno.exercises.length,
      blocksTotal: blocchi.length,
      blocksDone,
      inProgress: blocksDone > 0,
    };
  };

  const aperta = await prisma.workoutSession.findFirst({
    where: { userId, workoutId, completedAt: null },
    orderBy: { startedAt: 'desc' as const },
    select: { completed: { select: { workoutExerciseId: true } } },
  });
  const fatti = new Set((aperta?.completed ?? []).map((c) => c.workoutExerciseId));

  if (fatti.size > 0) {
    const inCorso = giorni.findIndex((g) => g.exercises.some((e) => fatti.has(e.id)));
    if (inCorso >= 0) return descrivi(inCorso, fatti);
  }

  const ultima = await prisma.workoutSession.findFirst({
    where: { userId, workoutId, completedAt: { not: null }, completed: { some: {} } },
    orderBy: { completedAt: 'desc' as const },
    select: {
      completed: {
        take: 1,
        select: { workoutExercise: { select: { workoutDayId: true } } },
      },
    },
  });
  const ultimoGiornoId = ultima?.completed[0]?.workoutExercise.workoutDayId;
  const ultimoIndice = giorni.findIndex((g) => g.id === ultimoGiornoId);

  return descrivi(ultimoIndice >= 0 ? (ultimoIndice + 1) % giorni.length : 0, new Set());
}

/**
 * Tutti i dati della home cliente in una sola chiamata.
 * Su rete mobile cinque richieste separate significano cinque
 * andate e ritorno: meglio un endpoint aggregato.
 */
export async function getClientDashboard(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      subscriptions: {
        orderBy: { endDate: 'desc' as const },
        take: 1,
        select: { startDate: true, endDate: true, plan: true },
      },
    },
  });

  if (!user) {
    throw unauthorized('Sessione non più valida.');
  }

  const [activeWorkout, news, closures] = await Promise.all([
    prisma.workout.findFirst({
      where: { userId, status: 'ACTIVE', isTemplate: false },
      orderBy: { startDate: 'desc' as const },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        _count: { select: { days: true } },
      },
    }),
    listNews(1),
    getUpcomingClosures(3),
  ]);

  const current = user.subscriptions[0] ?? null;
  const today = todayUtc();
  const daysLeft = current
    ? Math.round((current.endDate.getTime() - today.getTime()) / 86_400_000)
    : null;

  const { subscriptions, ...userData } = user;

  const nextDay = activeWorkout ? await prossimoGiorno(userId, activeWorkout.id) : null;

  return {
    user: userData,
    subscription: current
      ? {
          startDate: current.startDate,
          endDate: current.endDate,
          plan: current.plan,
          daysLeft,
          expired: daysLeft !== null && daysLeft < 0,
        }
      : null,
    activeWorkout,
    // Giorno da proporre come "prossimo allenamento"; null senza scheda.
    nextDay,
    latestNews: news[0] ?? null,
    upcomingClosures: closures,
  };
}
