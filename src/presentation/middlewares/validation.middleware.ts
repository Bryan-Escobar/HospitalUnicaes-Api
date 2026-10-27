/**
 * Middlewares de validación con Zod.
 * Si la validación falla responden 400 con `errors: [{ field, message }]`;
 * si pasa, reemplazan body/query/params por los datos ya parseados y tipados.
 */
import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodType } from 'zod';
import { ApiResponse, ValidationError } from '../../domain/interfaces';

type Source = 'body' | 'query' | 'params';

const MESSAGES: Record<Source, string> = {
  body: 'Error de validación en el body de la petición',
  query: 'Error de validación en query parameters',
  params: 'Error de validación en parámetros de ruta',
};

const validate =
  (source: Source) =>
  <T>(schema: ZodType<T>) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[source]);
      if (source === 'query') {
        // En Express 5 req.query es de solo lectura; se redefine para no depender de la versión.
        Object.defineProperty(req, 'query', { value: parsed, writable: true, configurable: true });
      } else {
        (req as unknown as Record<Source, unknown>)[source] = parsed;
      }
      next();
    } catch (error) {
      if (!(error instanceof ZodError)) return next(error);

      const errors: ValidationError[] = error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      const response: ApiResponse = {
        statusCode: 400,
        success: false,
        code: 'VALIDACION',
        message: MESSAGES[source],
        errors,
      };
      res.status(400).json(response);
    }
  };

export const validateBody = validate('body');
export const validateQuery = validate('query');
export const validateParams = validate('params');
