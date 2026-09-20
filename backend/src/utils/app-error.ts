export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(statusCode: number, message: string, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export const notFound = (message = 'Risorsa non trovata') => new AppError(404, message);
export const badRequest = (message = 'Richiesta non valida') => new AppError(400, message);
export const unauthorized = (message = 'Non autenticato') => new AppError(401, message);
export const forbidden = (message = 'Non autorizzato') => new AppError(403, message);
export const conflict = (message = 'Conflitto con lo stato attuale') => new AppError(409, message);
