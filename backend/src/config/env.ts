import dotenv from 'dotenv';

dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Variabile d'ambiente mancante: ${key}`);
  }
  return value;
}

/**
 * Origini ammesse dal CORS in produzione, separate da virgola.
 * Esempio: "https://powerbodyclub.vercel.app,https://localhost"
 * (la seconda e' l'origine dell'app Android). "*" le ammette tutte.
 */
function origini(valore: string): string[] {
  return valore
    .split(',')
    .map((origine) => origine.trim())
    .filter((origine) => origine.length > 0);
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  corsOrigins: origini(process.env.CORS_ORIGIN ?? 'http://localhost:4200'),
  jwtSecret: required('JWT_SECRET'),
  // Durata della sessione senza aprire l'app: a ogni apertura si rinnova.
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30d',
  isProduction: process.env.NODE_ENV === 'production',
};

// Chi conosce JWT_SECRET puo' firmare token validi per qualunque utente,
// istruttore compreso: in produzione deve essere lungo e casuale.
// Solo un avviso, non un blocco: fermare il server per questo lascerebbe
// la palestra senza app.
if (env.isProduction && env.jwtSecret.length < 32) {
  console.warn(
    '[sicurezza] JWT_SECRET e\' piu\' corto di 32 caratteri: sostituiscilo ' +
      'con un valore lungo e casuale.'
  );
}
