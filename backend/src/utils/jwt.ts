import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { unauthorized } from './app-error';

export interface JwtPayload {
  userId: number;
  username: string;
  role: 'CLIENT' | 'TRAINER';
}

export function signToken(payload: JwtPayload): string {
  // Cast necessario: @types/jsonwebtoken tipizza expiresIn come
  // number | StringValue (template literal del pacchetto "ms"),
  // incompatibile con una string generica letta da .env.
  const options = { expiresIn: env.jwtExpiresIn } as SignOptions;
  return jwt.sign(payload, env.jwtSecret, options);
}

export function verifyToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, env.jwtSecret) as JwtPayload;
  } catch {
    throw unauthorized('Sessione non valida o scaduta. Effettua di nuovo il login.');
  }
}
