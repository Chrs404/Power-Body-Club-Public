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
  /** null quando il cliente non ha un abbonamento o una scheda. */
  endDate: Date | null;
  /** Negativo se già scaduto, null se non c'è nulla da rinnovare. */
  daysLeft: number | null;
}

function nomeCliente(u: {
  firstName: string | null;
  lastName: string | null;
  username: string;
}): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username;
}

/**
 * Stato di abbonamento e scheda per ogni cliente, in un solo elenco.
 *
 * Per ogni cliente conta solo l'elemento "corrente": l'abbonamento con
 * la data di fine più avanzata, e la scheda attiva più recente con una
 * data di fine impostata. Il resto dello storico non interessa qui —
 * un abbonamento scaduto da mesi e già rinnovato non è una scadenza da
 * gestire, è solo un dato storico.
 *
 * Ogni cliente attivo produce SEMPRE due righe, una per tipo, anche
 * quando non ha nulla: in quel caso `endDate` e `daysLeft` sono null e
 * la riga vale "questa persona esiste e non ha un abbonamento".
 *
 * Il punto è importante, ed è costato un bug: prima la ricerca partiva
 * dagli abbonamenti (`subscriptions: { some: ... }`), quindi chi non ne
 * aveva nemmeno uno non produceva alcuna riga e spariva del tutto dalla
 * pagina Clienti — compreso un cliente appena creato senza date, che
 * l'istruttore non riusciva più a ritrovare. Partendo dai clienti il
 * problema non si ripresenta: l'assenza di un abbonamento diventa un
 * valore da mostrare, non una riga che manca.
 *
 * `finestraGiorni` è del tutto opzionale, senza un valore di ripiego:
 *
 * - assente — ogni cliente attivo, con o senza scadenze. È la modalità
 *   usata dalla pagina Clienti, che deve mostrare lo stato di tutti.
 * - valorizzato — solo le scadenze vere entro quel limite, già scadute
 *   comprese. Chi non ha nulla da rinnovare resta fuori: non ha una
 *   scadenza, quindi non è né in ritardo né in arrivo. È la modalità
 *   usata dal riepilogo in Home.
 *
 * Ordinato per urgenza: prima gli scaduti (daysLeft negativo), poi le
 * scadenze in arrivo, infine chi non ha nulla da rinnovare.
 */
export async function getRenewals(
  finestraGiorni?: number
): Promise<RenewalItem[]> {
  const oggi = todayUtc();
  const limite = finestraGiorni !== undefined ? addDaysUtc(oggi, finestraGiorni) : null;

  /*
   * Una sola query, che parte dai clienti. L'elenco di una singola
   * palestra è piccolo: non vale la pena dividerlo per tipo, e tenerlo
   * unito garantisce che le due righe di un cliente descrivano sempre
   * lo stesso istante.
   */
  const clienti = await prisma.user.findMany({
    where: { role: 'CLIENT', isActive: true },
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
      workouts: {
        where: { isTemplate: false, status: 'ACTIVE', endDate: { not: null } },
        orderBy: { endDate: 'desc' as const },
        take: 1,
        select: { name: true, endDate: true },
      },
    },
    orderBy: [{ lastName: 'asc' as const }, { firstName: 'asc' as const }],
  });

  const giorniResidui = (data: Date): number =>
    Math.round((data.getTime() - oggi.getTime()) / 86_400_000);

  const items: RenewalItem[] = [];

  for (const u of clienti) {
    const base = {
      clientId: u.id,
      clientName: nomeCliente(u),
      clientUsername: u.username,
    };

    const abbonamento = u.subscriptions[0] ?? null;
    items.push({
      ...base,
      type: 'subscription',
      label: abbonamento ? abbonamento.plan?.trim() || 'Abbonamento' : 'Nessun abbonamento',
      endDate: abbonamento?.endDate ?? null,
      daysLeft: abbonamento ? giorniResidui(abbonamento.endDate) : null,
    });

    // endDate è già filtrata non nulla nella query, ma Prisma la tipizza
    // comunque come opzionale: il controllo serve al compilatore.
    const scheda = u.workouts[0] ?? null;
    const fineScheda = scheda?.endDate ?? null;
    items.push({
      ...base,
      type: 'workout',
      label: scheda ? scheda.name : 'Nessuna scheda',
      endDate: fineScheda,
      daysLeft: fineScheda ? giorniResidui(fineScheda) : null,
    });
  }

  const daRinnovare = limite
    ? items.filter((i) => i.endDate !== null && i.endDate.getTime() <= limite.getTime())
    : items;

  // Chi non ha una scadenza va in fondo, non in cima: senza questo
  // finirebbe fra gli scaduti, perché null si comporta come 0.
  return daRinnovare.sort((a, b) => {
    if (a.daysLeft === null) return b.daysLeft === null ? 0 : 1;
    if (b.daysLeft === null) return -1;
    return a.daysLeft - b.daysLeft;
  });
}
