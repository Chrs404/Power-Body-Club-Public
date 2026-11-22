import { prisma } from '../prisma/client';
import { todayUtc, addDaysUtc } from '../utils/date';
import { notFound } from '../utils/app-error';

/**
 * Eliminazione automatica dei clienti non rinnovati.
 *
 * REGOLA: un cliente con abbonamento E scheda entrambi scaduti viene
 * eliminato, con tutti i suoi dati, 15 giorni dopo la scadenza piu'
 * recente fra le due. Se rinnova anche una sola delle due cose prima di
 * allora, il conteggio si ferma. Se si reiscrive dopo, va creato di nuovo.
 *
 * L'eliminazione e' irreversibile, quindi le protezioni sono diverse:
 *
 * - L'istruttore vede in anticipo chi sta per essere eliminato (elenco
 *   "In eliminazione") e puo' rimandare di altri 15 giorni.
 * - Riguarda solo i clienti attivi. Un cliente disattivato a mano e' stato
 *   messo da parte apposta per conservarne i dati, e non compare nella
 *   pagina Clienti: sparirebbe senza che nessuno se ne accorga.
 * - Non riguarda mai l'istruttore.
 * - Una scheda attiva senza data di fine non scade: quel cliente non entra
 *   nel conteggio.
 * - Si spegne del tutto con la variabile ELIMINAZIONE_AUTOMATICA=off.
 *
 * Chi non ha mai avuto un abbonamento (o una scheda) viene trattato come
 * se fosse scaduto il giorno della creazione: un cliente registrato e mai
 * avviato segue la stessa regola degli altri.
 */
export const GIORNI_PRIMA_DI_ELIMINARE = 15;

const GIORNO_MS = 86_400_000;

export interface ClienteInEliminazione {
  clientId: number;
  clientName: string;
  clientUsername: string;
  /** null = nessun abbonamento registrato. */
  subscriptionEnd: Date | null;
  /** null = nessuna scheda con una data di fine. */
  workoutEnd: Date | null;
  /** Giorno in cui verra' eliminato. */
  deleteOn: Date;
  /** Giorni che mancano; 0 o meno = alla prossima pulizia. */
  daysLeft: number;
}

function soloGiorno(data: Date): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
}

function piuRecente(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

/**
 * Clienti con abbonamento e scheda entrambi scaduti, dal piu' vicino
 * all'eliminazione al piu' lontano.
 *
 * `soloId` limita il calcolo a un cliente: serve alla sua pagina di
 * dettaglio, senza rileggere tutti gli altri.
 */
export async function getClientiInEliminazione(
  soloId?: number
): Promise<ClienteInEliminazione[]> {
  const oggi = todayUtc();

  const clienti = await prisma.user.findMany({
    where: {
      role: 'CLIENT',
      isActive: true,
      ...(soloId !== undefined ? { id: soloId } : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
      createdAt: true,
      deletionPostponedUntil: true,
      subscriptions: {
        orderBy: { endDate: 'desc' as const },
        take: 1,
        select: { endDate: true },
      },
      workouts: {
        where: { isTemplate: false },
        select: { status: true, endDate: true },
      },
    },
  });

  const risultato: ClienteInEliminazione[] = [];

  for (const u of clienti) {
    const creato = soloGiorno(u.createdAt);

    const fineAbbonamento = u.subscriptions[0]?.endDate ?? null;

    const attive = u.workouts.filter((w) => w.status === 'ACTIVE');
    // Scheda attiva senza scadenza: non scade mai, il cliente e' in regola.
    if (attive.some((w) => w.endDate === null)) continue;

    // Conta la scheda attiva; se non ce n'e' una, l'ultima che ha avuto.
    const candidate = attive.length > 0 ? attive : u.workouts;
    const fineScheda = candidate.reduce<Date | null>(
      (massima, w) =>
        w.endDate && (!massima || w.endDate.getTime() > massima.getTime())
          ? w.endDate
          : massima,
      null
    );

    const riferimentoAbbonamento = fineAbbonamento ?? creato;
    const riferimentoScheda = fineScheda ?? creato;

    // Il giorno di scadenza e' ancora valido: "scaduto" e' dal giorno dopo.
    const abbonamentoScaduto = riferimentoAbbonamento.getTime() < oggi.getTime();
    const schedaScaduta = riferimentoScheda.getTime() < oggi.getTime();
    if (!abbonamentoScaduto || !schedaScaduta) continue;

    let deleteOn = addDaysUtc(
      piuRecente(riferimentoAbbonamento, riferimentoScheda),
      GIORNI_PRIMA_DI_ELIMINARE
    );
    if (u.deletionPostponedUntil) {
      deleteOn = piuRecente(deleteOn, u.deletionPostponedUntil);
    }

    risultato.push({
      clientId: u.id,
      clientName: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username,
      clientUsername: u.username,
      subscriptionEnd: fineAbbonamento,
      workoutEnd: fineScheda,
      deleteOn,
      daysLeft: Math.round((deleteOn.getTime() - oggi.getTime()) / GIORNO_MS),
    });
  }

  return risultato.sort((a, b) => a.daysLeft - b.daysLeft);
}

/**
 * Rimanda l'eliminazione di un cliente: non verra' eliminato prima di
 * 15 giorni da oggi. Si puo' ripetere quante volte si vuole.
 */
export async function rimandaEliminazione(clientId: number): Promise<Date> {
  const cliente = await prisma.user.findFirst({
    where: { id: clientId, role: 'CLIENT' },
    select: { id: true },
  });

  if (!cliente) {
    throw notFound('Cliente non trovato.');
  }

  const fino = addDaysUtc(todayUtc(), GIORNI_PRIMA_DI_ELIMINARE);
  await prisma.user.update({
    where: { id: clientId },
    data: { deletionPostponedUntil: fino },
  });
  return fino;
}

function eliminazioneSpenta(): boolean {
  const valore = process.env.ELIMINAZIONE_AUTOMATICA?.trim().toLowerCase();
  return valore === 'off' || valore === 'false' || valore === '0';
}

/**
 * Elimina i clienti il cui termine e' arrivato. Restituisce quanti.
 *
 * Ogni eliminazione finisce nei log con nome e username: e' l'unica
 * traccia che resta, e serve a rispondere a "che fine ha fatto?".
 */
export async function eliminaClientiScaduti(): Promise<number> {
  if (eliminazioneSpenta()) return 0;

  const scaduti = (await getClientiInEliminazione()).filter((c) => c.daysLeft <= 0);
  let eliminati = 0;

  for (const cliente of scaduti) {
    try {
      // role: 'CLIENT' ribadito nella condizione: qualunque cosa accada
      // al calcolo qui sopra, un istruttore non puo' essere eliminato.
      const esito = await prisma.user.deleteMany({
        where: { id: cliente.clientId, role: 'CLIENT' },
      });

      if (esito.count > 0) {
        eliminati++;
        console.log(
          `[pulizia] eliminato "${cliente.clientName}" (${cliente.clientUsername}): ` +
            'abbonamento e scheda scaduti da oltre ' +
            `${GIORNI_PRIMA_DI_ELIMINARE} giorni`
        );
      }
    } catch (errore) {
      // Un cliente che non si riesce a eliminare non deve fermare gli altri.
      console.error(`[pulizia] eliminazione di "${cliente.clientUsername}" fallita:`, errore);
    }
  }

  return eliminati;
}

/**
 * Avvia la pulizia: una volta subito, poi ogni sei ore.
 *
 * Non serve un orario preciso. Su Render il servizio va in pausa quando
 * nessuno lo usa e riparte alla prima richiesta: ogni riavvio esegue la
 * pulizia, quindi un termine scaduto durante la pausa viene recuperato
 * appena qualcuno apre l'app.
 */
export function avviaPulizia(): NodeJS.Timeout | null {
  if (eliminazioneSpenta()) {
    console.log('[pulizia] eliminazione automatica spenta (ELIMINAZIONE_AUTOMATICA)');
    return null;
  }

  const esegui = () =>
    void eliminaClientiScaduti().catch((errore) =>
      console.error('[pulizia] controllo fallito:', errore)
    );

  esegui();

  const timer = setInterval(esegui, 6 * 60 * 60 * 1000);
  // Non deve tenere in vita il processo durante la chiusura.
  timer.unref();
  return timer;
}
