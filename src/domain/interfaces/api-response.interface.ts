import { ErrorCode } from '../errors/error-codes';

/**
 * Respuesta estándar de la API, para éxito y para error.
 *
 * Éxito: { statusCode, success: true, message, data }
 * Error: { statusCode, success: false, code, message, errors? }
 *   - code:    causa exacta, legible por máquina (ver src/domain/errors/error-codes.ts)
 *   - message: texto para mostrar al usuario (puede cambiar; no compararlo en los clientes)
 *   - errors:  detalle por campo cuando falla la validación
 */

/**
 * Error de validación individual
 */
export interface ValidationError {
  field: string;
  message: string;
}

export interface ApiResponse<T = unknown> {
  statusCode: number;
  success: boolean;
  code?: ErrorCode;
  message: string;
  data?: T;
  errors?: ValidationError[];
}
