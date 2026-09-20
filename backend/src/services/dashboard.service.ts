import { prisma } from '../prisma/client';
import { todayUtc } from '../utils/date';
import { getUpcomingClosures, listNews } from './gym.service';
import { unauthorized } from '../utils/app-error';

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
    latestNews: news[0] ?? null,
    upcomingClosures: closures,
  };
}
