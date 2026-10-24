import { ZodError } from 'zod';
import { CustomError } from '../domain/errors/CustomError';
import { ERROR_CODES, ErrorCode } from '../domain/errors/error-codes';
import { ErrorHandlerInterface } from '../domain/errors/errorHandler.interface';
import { ApiResponse } from '../domain/interfaces';

// Traduce cualquier error a { statusCode, code, message } sin filtrar detalles internos al cliente.
export const handleError = (error: unknown): ErrorHandlerInterface => {
  if (error instanceof CustomError) {
    return { statusCode: error.statusCode, code: error.code, message: error.message };
  }

  if (error instanceof ZodError) {
    const message = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
    return { statusCode: 400, code: 'VALIDACION', message };
  }

  // Errores conocidos de Prisma (https://www.prisma.io/docs/orm/reference/error-reference)
  if (error && typeof error === 'object' && 'code' in error) {
    switch (String((error as { code: unknown }).code)) {
      case 'P2002':
        return { statusCode: 409, code: 'REGISTRO_DUPLICADO', message: 'Ya existe un registro con esos datos únicos' };
      case 'P2003':
        return { statusCode: 400, code: 'REFERENCIA_INVALIDA', message: 'El registro referenciado no existe' };
      case 'P2025':
        return { statusCode: 404, code: 'NO_ENCONTRADO', message: 'No se encontró el registro solicitado' };
    }
  }

  // Reglas que valida la BD con triggers: lanzan 'CODIGO: detalle' (p. ej. CONSULTA_CERRADA).
  // Se responde con la descripción del catálogo, sin reenviar el texto de la BD.
  const dbCode = error instanceof Error ? /\b([A-Z][A-Z_]{2,}):/.exec(error.message)?.[1] : undefined;
  if (dbCode && dbCode in ERROR_CODES) {
    const code = dbCode as ErrorCode;
    return { statusCode: ERROR_CODES[code].status, code, message: ERROR_CODES[code].descripcion };
  }

  return { statusCode: 500, code: 'ERROR_INTERNO', message: 'Error interno del servidor' };
};

// Cuerpo `ApiResponse` de error listo para `res.status(body.statusCode).json(body)`.
export const toErrorResponse = (error: unknown): ApiResponse => {
  const { statusCode, code, message } = handleError(error);
  return { statusCode, success: false, code, message };
};
