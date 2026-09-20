import { prisma } from '../prisma/client';
import { todayUtc, addDaysUtc } from '../utils/date';

export type RenewalType = 'subscription' | 'workout';

export interface RenewalItem {
  clientId: number;
  clientName: string;
  clientUsername: string;
  type: RenewalType;
  /** Nome del piano o della scheda, mostrato come sottotitolo. */
  label: string;
  endDate: Date;
  /** Negativo se già scaduto. */
  daysLeft: number;
}

function nomeCliente(u: {
  firstName: string | null;
  lastName: string | null;
  username: string;
}): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username;
}

/**
 * Scadenze di abbonamenti e schede, unificate in un solo elenco.
 *
 * Per ogni cliente conta solo l'elemento "corrente": l'abbonamento con
 * la data di fine più avanzata, e la scheda attiva più recente con una
 * data di fine impostata. Il resto dello storico non interessa qui —
 * un abbonamento scaduto da mesi e già rinnovato non è una scadenza da
 * gestire, è solo un dato storico.
 *
 * Le schede sono escluse dal conteggio se non hanno endDate: è un campo
 * facoltativo, e una scheda senza scadenza non genera mai un avviso.
 *
 * `finestraGiorni` è del tutto opzionale, senza un valore di ripiego:
 * lasciandolo assente si ottiene ogni cliente che ha almeno un
 * abbonamento o una scheda, qualunque sia la distanza della scadenza.
 * È la modalità usata dalla pagina Clienti, che deve mostrare lo stato
 * di tutti, non solo di chi è vicino alla scadenza. Il riepilogo
 * sintetico in Home passa invece un valore esplicito.
 *
 * Ordinato per urgenza: gli elementi già scaduti (daysLeft negativo)
 * vengono prima di quelli in scadenza, e fra loro dal più vecchio.
 */
export async function getRenewals(
  finestraGiorni?: number
): Promise<RenewalItem[]> {
  const oggi = todayUtc();
  const limite = finestraGiorni !== undefined ? addDaysUtc(oggi, finestraGiorni) : null;
  const filtroScadenza = limite ? { lte: limite } : undefined;

  const [clientiConAbbonamento, clientiConScheda] = await Promise.all([
    prisma.user.findMany({
      where: {
        role: 'CLIENT',
        isActive: true,
        subscriptions: { some: filtroScadenza ? { endDate: filtroScadenza } : {} },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        subscriptions: {
          orderBy: { endDate: 'desc' as const },
          take: 1,
          select: { endDate: true, plan: true },
        },
      },
    }),
    prisma.user.findMany({
      where: {
        role: 'CLIENT',
        isActive: true,
        workouts: {
          some: {
            isTemplate: false,
            status: 'ACTIVE',
            endDate: filtroScadenza ? { not: null, ...filtroScadenza } : { not: null },
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        workouts: {
          where: { isTemplate: false, status: 'ACTIVE', endDate: { not: null } },
          orderBy: { endDate: 'desc' as const },
          take: 1,
          select: { name: true, endDate: true },
        },
      },
    }),
  ]);

  const giorniResidui = (data: Date): number =>
    Math.round((data.getTime() - oggi.getTime()) / 86_400_000);

  type ClienteConAbbonamento = {
    id: number;
    firstName: string | null;
    lastName: string | null;
    username: string;
    subscriptions: { endDate: Date; plan: string | null }[];
  };
  type ClienteConScheda = {
    id: number;
    firstName: string | null;
    lastName: string | null;
    username: string;
    workouts: { name: string; endDate: Date | null }[];
  };

  const abbonamenti: RenewalItem[] = (clientiConAbbonamento as ClienteConAbbonamento[])
    .filter((u) => u.subscriptions[0])
    .map((u) => {
      const sub = u.subscriptions[0];
      return {
        clientId: u.id,
        clientName: nomeCliente(u),
        clientUsername: u.username,
        type: 'subscription' as const,
        label: sub.plan?.trim() || 'Abbonamento',
        endDate: sub.endDate,
        daysLeft: giorniResidui(sub.endDate),
      };
    });

  const schede: RenewalItem[] = (clientiConScheda as ClienteConScheda[])
    .filter((u) => u.workouts[0]?.endDate)
    .map((u) => {
      const w = u.workouts[0];
      const scadenza = w.endDate as Date;
      return {
        clientId: u.id,
        clientName: nomeCliente(u),
        clientUsername: u.username,
        type: 'workout' as const,
        label: w.name,
        endDate: scadenza,
        daysLeft: giorniResidui(scadenza),
      };
    });

  return [...abbonamenti, ...schede].sort((a, b) => a.daysLeft - b.daysLeft);
}
