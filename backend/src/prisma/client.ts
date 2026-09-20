import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

export const prisma = new PrismaClient({
  log: env.isProduction ? ['error'] : ['query', 'warn', 'error'],
});
