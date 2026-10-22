import { NextFunction, Request, Response } from 'express';
import { ApiResponse } from '../../domain/interfaces';
import { handleError } from '../../lib/errorHandler';

// Rutas inexistentes → 404 con el formato estándar.
export const notFoundHandler = (req: Request, res: Response) => {
  const response: ApiResponse = {
    statusCode: 404,
    success: false,
    message: `Ruta no encontrada: ${req.method} ${req.path}`,
  };
  res.status(404).json(response);
};

// Último recurso para errores no capturados (JSON mal formado, errores lanzados con next(err), etc.).
export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const isBodyParseError =
    err instanceof SyntaxError && (err as SyntaxError & { type?: string }).type === 'entity.parse.failed';

  const { statusCode, message } = isBodyParseError
    ? { statusCode: 400, message: 'El cuerpo de la petición no es un JSON válido' }
    : handleError(err);

  if (statusCode >= 500) req.log?.error({ err }, 'Error no controlado');

  const response: ApiResponse = { statusCode, success: false, message };
  res.status(statusCode).json(response);
};
