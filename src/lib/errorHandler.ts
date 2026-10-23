import { ZodError } from 'zod';
import { CustomError } from '../domain/errors/CustomError';
import { ErrorHandlerInterface } from '../domain/errors/errorHandler.interface';

// Traduce cualquier error a { statusCode, message } sin filtrar detalles internos al cliente.
export const handleError = (error: unknown): ErrorHandlerInterface => {
  if (error instanceof CustomError) {
    return { statusCode: error.statusCode, message: error.message };
  }

  if (error instanceof ZodError) {
    const message = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
    return { statusCode: 400, message };
  }

  // Errores conocidos de Prisma (https://www.prisma.io/docs/orm/reference/error-reference)
  if (error && typeof error === 'object' && 'code' in error) {
    switch (String((error as { code: unknown }).code)) {
      case 'P2002':
        return { statusCode: 409, message: 'Ya existe un registro con esos datos únicos' };
      case 'P2003':
        return { statusCode: 400, message: 'El registro referenciado no existe' };
      case 'P2025':
        return { statusCode: 404, message: 'No se encontró el registro solicitado' };
    }
  }

  return { statusCode: 500, message: 'Error interno del servidor' };
};
