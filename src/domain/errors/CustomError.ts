import { DEFAULT_CODE_BY_STATUS, ERROR_CODES, ErrorCode } from './error-codes';

export class CustomError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;

  constructor(message: string, statusCode: number, code?: ErrorCode) {
    super(message);
    this.statusCode = statusCode;
    this.code = code ?? DEFAULT_CODE_BY_STATUS[statusCode] ?? 'ERROR_INTERNO';
    Object.setPrototypeOf(this, CustomError.prototype); // Necesario para extender correctamente Error
  }

  /**
   * Error de negocio a partir del catálogo: el status sale de ERROR_CODES.
   * @example throw CustomError.fromCode('CAMA_OCUPADA', 'La cama HAB-201-A ya está ocupada');
   */
  static fromCode(code: ErrorCode, message: string = ERROR_CODES[code].descripcion) {
    return new CustomError(message, ERROR_CODES[code].status, code);
  }

  // Factory methods para errores comunes
  static badRequest(message: string, code: ErrorCode = 'SOLICITUD_INVALIDA') {
    return new CustomError(message, 400, code);
  }

  static unauthorized(message = 'No autenticado') {
    return new CustomError(message, 401, 'NO_AUTENTICADO');
  }

  static forbidden(message = 'Acceso denegado') {
    return new CustomError(message, 403, 'ACCESO_DENEGADO');
  }

  static notFound(message = 'Recurso no encontrado') {
    return new CustomError(message, 404, 'NO_ENCONTRADO');
  }

  static conflict(message: string, code: ErrorCode = 'CONFLICTO') {
    return new CustomError(message, 409, code);
  }

  static unprocessable(message: string, code: ErrorCode = 'REGLA_DE_NEGOCIO') {
    return new CustomError(message, 422, code);
  }

  static internal(message = 'Error interno del servidor') {
    return new CustomError(message, 500, 'ERROR_INTERNO');
  }
}
