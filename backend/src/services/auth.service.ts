import { prisma } from '../prisma/client';
import { hashPassword, verifyPassword } from '../utils/password';
import { signToken, JwtPayload } from '../utils/jwt';
import { unauthorized, notFound, badRequest } from '../utils/app-error';

export interface AuthenticatedUser {
  id: number;
  username: string;
  role: 'CLIENT' | 'TRAINER';
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  mustChangePassword: boolean;
}

function toAuthenticatedUser(user: {
  id: number;
  username: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  mustChangePassword: boolean;
}): AuthenticatedUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role as 'CLIENT' | 'TRAINER',
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    mustChangePassword: user.mustChangePassword,
  };
}

export async function login(
  username: string,
  password: string
): Promise<{ token: string; user: AuthenticatedUser }> {
  const user = await prisma.user.findUnique({
    where: { username: username.trim().toLowerCase() },
  });

  // Messaggio identico per utente inesistente e password errata:
  // non rivelare quali username esistono.
  const genericError = unauthorized('Username o password non corretti.');

  if (!user) {
    throw genericError;
  }

  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    throw genericError;
  }

  if (!user.isActive) {
    throw unauthorized('Account disattivato. Contatta la palestra.');
  }

  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    role: user.role as 'CLIENT' | 'TRAINER',
  };

  return {
    token: signToken(payload),
    user: toAuthenticatedUser(user),
  };
}

export async function getCurrentUser(userId: number): Promise<AuthenticatedUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || !user.isActive) {
    throw unauthorized("Sessione non più valida.");
  }

  return toAuthenticatedUser(user);
}

/**
 * Profilo aggiornato e un token nuovo, con la durata piena.
 *
 * Serve a far scadere la sessione dall'ULTIMO utilizzo invece che dal
 * login: l'app lo chiama a ogni apertura, quindi chi la usa non viene
 * mai buttato fuori, e chi non la apre per JWT_EXPIRES_IN giorni deve
 * rientrare. Prima il token scadeva a data fissa dal login, anche per
 * chi apriva l'app tutti i giorni.
 *
 * Il token nuovo si costruisce dai dati appena letti dal database, non
 * da quelli del token vecchio: un cambio di username o di ruolo viene
 * cosi' recepito. Un utente disattivato non arriva fin qui, perche'
 * getCurrentUser lo respinge prima.
 */
export async function rinnovaSessione(
  userId: number
): Promise<{ token: string; user: AuthenticatedUser }> {
  const user = await getCurrentUser(userId);
  return {
    token: signToken({ userId: user.id, username: user.username, role: user.role }),
    user,
  };
}

/**
 * Primo accesso: il cliente imposta la password definitiva.
 * Nome e cognome sono normalmente gia' presenti (inseriti dall'istruttore)
 * e non vengono richiesti; restano modificabili dal profilo.
 * Se il profilo ne e' privo, diventano obbligatori qui.
 */
export async function completeFirstAccess(
  userId: number,
  data: {
    newPassword: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  }
): Promise<{ token: string; user: AuthenticatedUser }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw notFound('Utente non trovato.');
  }

  if (!user.mustChangePassword) {
    throw badRequest('Il primo accesso è già stato completato.');
  }

  const samePassword = await verifyPassword(data.newPassword, user.passwordHash);
  if (samePassword) {
    throw badRequest('La nuova password deve essere diversa da quella temporanea.');
  }

  const firstName = data.firstName?.trim() || user.firstName;
  const lastName = data.lastName?.trim() || user.lastName;

  if (!firstName || !lastName) {
    throw badRequest('Nome e cognome sono obbligatori.');
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(data.newPassword),
      firstName,
      lastName,
      // I contatti si sovrascrivono solo se inviati: altrimenti
      // un campo lasciato vuoto cancellerebbe quello gia' registrato.
      ...(data.email !== undefined ? { email: data.email.trim() || null } : {}),
      ...(data.phone !== undefined ? { phone: data.phone.trim() || null } : {}),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    },
  });

  return { token: tokenDopoCambioPassword(updated), user: toAuthenticatedUser(updated) };
}

/**
 * Token da restituire a chi ha appena cambiato la propria password.
 *
 * Il cambio invalida tutti i token emessi prima (vedi authenticate),
 * compreso quello con cui e' arrivata la richiesta: senza un token nuovo
 * l'utente verrebbe buttato fuori dal dispositivo su cui ha appena
 * scelto la password. Gli altri dispositivi invece devono rientrare,
 * ed e' proprio lo scopo.
 *
 * Va firmato DOPO aver scritto passwordChangedAt, cosi' la sua data di
 * emissione non risulta precedente al cambio.
 */
function tokenDopoCambioPassword(user: { id: number; username: string; role: string }): string {
  return signToken({
    userId: user.id,
    username: user.username,
    role: user.role as 'CLIENT' | 'TRAINER',
  });
}

export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string
): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw notFound('Utente non trovato.');
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    throw badRequest('La password attuale non è corretta.');
  }

  if (currentPassword === newPassword) {
    throw badRequest('La nuova password deve essere diversa da quella attuale.');
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    },
  });

  return tokenDopoCambioPassword(updated);
}
