import { NextFunction, Request, Response } from 'express';
import { CustomError } from '../../domain/errors/CustomError';
import { ApiResponse } from '../../domain/interfaces';
import { toErrorResponse } from '../../lib/errorHandler';

// Rutas inexistentes → 404 con el formato estándar.
export const notFoundHandler = (req: Request, res: Response) => {
  const response: ApiResponse = {
    statusCode: 404,
    success: false,
    code: 'RUTA_NO_ENCONTRADA',
    message: `Ruta no encontrada: ${req.method} ${req.path}`,
  };
  res.status(404).json(response);
};

// Último recurso para errores no capturados (JSON mal formado, errores lanzados con next(err), etc.).
export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const isBodyParseError =
    err instanceof SyntaxError && (err as SyntaxError & { type?: string }).type === 'entity.parse.failed';

  const response = toErrorResponse(
    isBodyParseError ? CustomError.badRequest('El cuerpo de la petición no es un JSON válido', 'JSON_INVALIDO') : err,
  );

  if (response.statusCode >= 500) req.log?.error({ err }, 'Error no controlado');

  res.status(response.statusCode).json(response);
};
