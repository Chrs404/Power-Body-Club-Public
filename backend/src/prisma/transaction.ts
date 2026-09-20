import { prisma } from './client';

/**
 * Tipo del client passato dentro prisma.$transaction.
 *
 * Non e' il PrismaClient completo: Prisma rimuove i metodi che non hanno
 * senso dentro una transazione gia' aperta ($connect, $transaction, ...).
 * Annotare il parametro come "typeof prisma" compila solo finche' il
 * client non e' stato generato; appena lo e', TypeScript segnala
 * l'incompatibilita'.
 *
 * Derivandolo qui, resta corretto senza dover importare il namespace
 * Prisma, che esiste solo dopo "prisma generate".
 */
export type TransactionClient = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
