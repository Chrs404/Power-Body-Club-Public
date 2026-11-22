import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { unauthorized } from './app-error';

export interface JwtPayload {
  userId: number;
  username: string;
  role: 'CLIENT' | 'TRAINER';
}

/**
 * Contenuto di un token gia' verificato: oltre ai dati dell'utente porta
 * l'istante di emissione (in secondi), che authenticate confronta con la
 * data dell'ultimo cambio password.
 */
export interface VerifiedToken extends JwtPayload {
  iat: number;
}

export function signToken(payload: JwtPayload): string {
  // Cast necessario: @types/jsonwebtoken tipizza expiresIn come
  // number | StringValue (template literal del pacchetto "ms"),
  // incompatibile con una string generica letta da .env.
  const options = { expiresIn: env.jwtExpiresIn } as SignOptions;
  return jwt.sign(payload, env.jwtSecret, options);
}

export function verifyToken(token: string): VerifiedToken {
  try {
    // Algoritmo fissato: un token firmato in altro modo viene respinto
    // anche se la libreria lo saprebbe leggere.
    return jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] }) as VerifiedToken;
  } catch {
    throw unauthorized('Sessione non valida o scaduta. Effettua di nuovo il login.');
  }
}
