import { prisma } from '../prisma/client';
import { hashPassword, generateTemporaryPassword } from '../utils/password';
import { buildUsernameBase, pickAvailableUsername } from '../utils/username';
import { parseDateOnly, todayUtc, addDaysUtc } from '../utils/date';
import { notFound, badRequest, conflict } from '../utils/app-error';
import {
  CreateClientInput,
  UpdateClientInput,
  CreateSubscriptionInput,
  UpdateProfileInput,
  ListClientsQuery,
} from '../schemas/user.schema';

/** Campi restituiti al client: mai passwordHash. */
const clientSelect = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  birthDate: true,
  notes: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
} as const;

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Aggancia a ogni utente l'abbonamento corrente (quello con endDate
 * piu' avanzata) e i giorni residui.
 */
function withSubscriptionInfo<T extends { subscriptions: { endDate: Date; startDate: Date; plan: string | null }[] }>(
  user: T
) {
  const current = user.subscriptions[0] ?? null;
  const today = todayUtc();

  let daysLeft: number | null = null;
  if (current) {
    const diff = current.endDate.getTime() - today.getTime();
    daysLeft = Math.round(diff / 86_400_000);
  }

  const { subscriptions, ...rest } = user;
  return {
    ...rest,
    subscription: current
      ? {
          startDate: current.startDate,
          endDate: current.endDate,
          plan: current.plan,
          daysLeft,
          expired: daysLeft !== null && daysLeft < 0,
        }
      : null,
  };
}

export async function listClients(query: ListClientsQuery) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;

  const search = query.search?.trim();
  const insensitive = 'insensitive' as const;

  const where = {
    role: 'CLIENT' as const,
    ...(query.status === 'active' ? { isActive: true } : {}),
    ...(query.status === 'inactive' ? { isActive: false } : {}),
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: insensitive } },
            { lastName: { contains: search, mode: insensitive } },
            { username: { contains: search, mode: insensitive } },
            { email: { contains: search, mode: insensitive } },
            { phone: { contains: search } },
          ],
        }
      : {}),
    // Filtro "in scadenza entro N giorni": include anche i gia' scaduti,
    // perche' sono i casi piu' urgenti da rinnovare.
    ...(query.expiring !== undefined
      ? {
          subscriptions: {
            some: { endDate: { lte: addDaysUtc(todayUtc(), query.expiring) } },
          },
        }
      : {}),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        ...clientSelect,
        subscriptions: {
          orderBy: { endDate: 'desc' as const },
          take: 1,
          select: { startDate: true, endDate: true, plan: true },
        },
      },
      orderBy: [{ lastName: 'asc' as const }, { firstName: 'asc' as const }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: users.map(withSubscriptionInfo),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getClientById(id: number) {
  const user = await prisma.user.findFirst({
    where: { id, role: 'CLIENT' },
    select: {
      ...clientSelect,
      subscriptions: {
        orderBy: { endDate: 'desc' as const },
        select: { id: true, startDate: true, endDate: true, plan: true, notes: true },
      },
    },
  });

  if (!user) {
    throw notFound('Cliente non trovato.');
  }

  const current = user.subscriptions[0] ?? null;
  const today = todayUtc();
  const daysLeft = current
    ? Math.round((current.endDate.getTime() - today.getTime()) / 86_400_000)
    : null;

  return {
    ...user,
    subscription: current
      ? { ...current, daysLeft, expired: daysLeft !== null && daysLeft < 0 }
      : null,
  };
}

/**
 * Crea un cliente generando username e password temporanea.
 * La password in chiaro viene restituita UNA SOLA VOLTA: nel database
 * resta solo l'hash, quindi non e' piu' recuperabile.
 */
export async function createClient(input: CreateClientInput) {
  const base = buildUsernameBase(input.firstName, input.lastName);

  const existing = await prisma.user.findMany({
    where: { username: { startsWith: base } },
    select: { username: true },
  });

  const username = pickAvailableUsername(base, new Set(existing.map((u: { username: string }) => u.username)));
  const temporaryPassword = generateTemporaryPassword();

  const email = emptyToNull(input.email);
  if (email) {
    const emailTaken = await prisma.user.findUnique({ where: { email } });
    if (emailTaken) {
      throw conflict('Esiste già un utente con questa email.');
    }
  }

  const hasSubscription = Boolean(input.subscriptionStart && input.subscriptionEnd);
  if (hasSubscription) {
    const start = parseDateOnly(input.subscriptionStart!, "data d'inizio");
    const end = parseDateOnly(input.subscriptionEnd!, 'data di scadenza');
    if (end <= start) {
      throw badRequest('La scadenza deve essere successiva alla data di inizio.');
    }
  }

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await hashPassword(temporaryPassword),
      role: 'CLIENT',
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email,
      phone: emptyToNull(input.phone),
      birthDate: input.birthDate ? parseDateOnly(input.birthDate, 'data di nascita') : null,
      notes: emptyToNull(input.notes),
      mustChangePassword: true,
      ...(hasSubscription
        ? {
            subscriptions: {
              create: {
                startDate: parseDateOnly(input.subscriptionStart!),
                endDate: parseDateOnly(input.subscriptionEnd!),
                plan: emptyToNull(input.subscriptionPlan),
              },
            },
          }
        : {}),
    },
    select: clientSelect,
  });

  return { user, credentials: { username, temporaryPassword } };
}

export async function updateClient(id: number, input: UpdateClientInput) {
  const existing = await prisma.user.findFirst({ where: { id, role: 'CLIENT' } });
  if (!existing) {
    throw notFound('Cliente non trovato.');
  }

  const email = input.email !== undefined ? emptyToNull(input.email) : undefined;
  if (email) {
    const taken = await prisma.user.findFirst({
      where: { email, id: { not: id } },
    });
    if (taken) {
      throw conflict('Esiste già un utente con questa email.');
    }
  }

  return prisma.user.update({
    where: { id },
    data: {
      firstName: input.firstName?.trim(),
      lastName: input.lastName?.trim(),
      email,
      phone: input.phone !== undefined ? emptyToNull(input.phone) : undefined,
      birthDate:
        input.birthDate !== undefined
          ? input.birthDate
            ? parseDateOnly(input.birthDate, 'data di nascita')
            : null
          : undefined,
      notes: input.notes !== undefined ? emptyToNull(input.notes) : undefined,
      isActive: input.isActive,
    },
    select: clientSelect,
  });
}

/** Genera una nuova password temporanea e riattiva il flusso di primo accesso. */
export async function resetClientPassword(id: number) {
  const existing = await prisma.user.findFirst({ where: { id, role: 'CLIENT' } });
  if (!existing) {
    throw notFound('Cliente non trovato.');
  }

  const temporaryPassword = generateTemporaryPassword();

  await prisma.user.update({
    where: { id },
    data: {
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
    },
  });

  return { username: existing.username, temporaryPassword };
}

export async function addSubscription(userId: number, input: CreateSubscriptionInput) {
  const existing = await prisma.user.findFirst({ where: { id: userId, role: 'CLIENT' } });
  if (!existing) {
    throw notFound('Cliente non trovato.');
  }

  const startDate = parseDateOnly(input.startDate, "data d'inizio");
  const endDate = parseDateOnly(input.endDate, 'data di scadenza');

  if (endDate <= startDate) {
    throw badRequest('La scadenza deve essere successiva alla data di inizio.');
  }

  return prisma.subscription.create({
    data: {
      userId,
      startDate,
      endDate,
      plan: emptyToNull(input.plan),
      notes: emptyToNull(input.notes),
    },
  });
}

/** Riepilogo per la dashboard istruttore. */
export async function getClientsSummary() {
  const today = todayUtc();
  const in30Days = addDaysUtc(today, 30);

  const [total, active, expiring, expired] = await Promise.all([
    prisma.user.count({ where: { role: 'CLIENT' } }),
    prisma.user.count({ where: { role: 'CLIENT', isActive: true } }),
    prisma.user.count({
      where: {
        role: 'CLIENT',
        isActive: true,
        subscriptions: { some: { endDate: { gte: today, lte: in30Days } } },
      },
    }),
    prisma.user.count({
      where: {
        role: 'CLIENT',
        isActive: true,
        subscriptions: { every: { endDate: { lt: today } } },
      },
    }),
  ]);

  return { total, active, expiring, expired };
}

/** Aggiornamento del proprio profilo, usato dal cliente. */
export async function updateOwnProfile(userId: number, input: UpdateProfileInput) {
  const email = input.email !== undefined ? emptyToNull(input.email) : undefined;

  if (email) {
    const taken = await prisma.user.findFirst({
      where: { email, id: { not: userId } },
    });
    if (taken) {
      throw conflict('Esiste già un utente con questa email.');
    }
  }

  return prisma.user.update({
    where: { id: userId },
    data: {
      firstName: input.firstName?.trim(),
      lastName: input.lastName?.trim(),
      email,
      phone: input.phone !== undefined ? emptyToNull(input.phone) : undefined,
    },
    select: clientSelect,
  });
}

/**
 * Elimina un abbonamento inserito per errore.
 * Verifica che appartenga davvero al cliente indicato: senza questo
 * controllo, conoscere un id permetterebbe di cancellare l'abbonamento
 * di un altro cliente.
 */
export async function deleteSubscription(
  userId: number,
  subscriptionId: number
): Promise<void> {
  const subscription = await prisma.subscription.findFirst({
    where: { id: subscriptionId, userId },
  });

  if (!subscription) {
    throw notFound('Abbonamento non trovato.');
  }

  await prisma.subscription.delete({ where: { id: subscriptionId } });
}

/**
 * Riepilogo di cio' che verrebbe eliminato insieme al cliente.
 *
 * Serve a mostrare numeri concreti nella conferma: "verranno eliminati
 * anche 3 schede e 47 pesi registrati" e' un avviso ben diverso da un
 * generico "sei sicuro?".
 */
export async function getDeletionPreview(id: number) {
  const user = await prisma.user.findFirst({
    where: { id, role: 'CLIENT' },
    select: { id: true, username: true, firstName: true, lastName: true },
  });

  if (!user) {
    throw notFound('Cliente non trovato.');
  }

  const [schede, sessioni, pesi, abbonamenti] = await Promise.all([
    prisma.workout.count({ where: { userId: id, isTemplate: false } }),
    prisma.workoutSession.count({ where: { userId: id } }),
    prisma.weightLog.count({ where: { userId: id } }),
    prisma.subscription.count({ where: { userId: id } }),
  ]);

  return { user, schede, sessioni, pesi, abbonamenti };
}

/**
 * Elimina definitivamente un cliente e tutti i suoi dati.
 *
 * L'operazione e' irreversibile: le relazioni verso l'utente hanno
 * cancellazione a cascata, quindi spariscono anche abbonamenti, schede,
 * sessioni di allenamento e storico pesi.
 *
 * Per questo l'app propone normalmente la disattivazione, che conserva
 * tutto e impedisce solo l'accesso. L'eliminazione serve nei casi in cui
 * i dati vanno rimossi davvero, come una richiesta di cancellazione
 * da parte dell'interessato.
 *
 * L'istruttore non puo' essere eliminato: senza di lui nessuno potrebbe
 * piu' amministrare la palestra. Il controllo su role: 'CLIENT' e'
 * gia' sufficiente, ma viene ribadito per chiarezza.
 */
export async function deleteClient(id: number, richiedenteId: number): Promise<void> {
  if (id === richiedenteId) {
    throw badRequest('Non puoi eliminare il tuo stesso account.');
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });

  if (!user || user.role !== 'CLIENT') {
    throw notFound('Cliente non trovato.');
  }

  /*
   * Le comunicazioni pubblicate e le schede create puntano all'utente
   * senza cascata: sono scritte dall'istruttore, non dal cliente, quindi
   * un cliente non ne possiede. Se in futuro un cliente potesse
   * pubblicare qualcosa, qui servirebbe una riassegnazione.
   */
  await prisma.user.delete({ where: { id } });
}
