import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';
import { AppError } from '../utils/app-error';

/**
 * Valida req.body contro uno schema Zod e lo sostituisce con il dato
 * validato e tipizzato. In caso di errore restituisce 400 con l'elenco
 * dei campi non validi.
 */
export function validate(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const fields: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || 'body';
        if (!fields[key]) {
          fields[key] = issue.message;
        }
      }

      const error = new AppError(400, 'Dati non validi.') as AppError & {
        fields?: Record<string, string>;
      };
      error.fields = fields;
      throw error;
    }

    req.body = result.data;
    next();
  };
}
