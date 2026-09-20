import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/app-error';
import { env } from '../config/env';

export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  next(new AppError(404, `Endpoint non trovato: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message =
    err instanceof AppError
      ? err.message
      : 'Si è verificato un errore interno. Riprova più tardi.';

  // Popolato dal middleware validate: mappa campo -> messaggio.
  const fields = (err as AppError & { fields?: Record<string, string> }).fields;

  if (statusCode >= 500) {
    console.error('[ERROR]', err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(fields ? { fields } : {}),
    ...(env.isProduction ? {} : { stack: err.stack }),
  });
}
