import { CustomError } from '../../src/domain/errors/CustomError';
import { ERROR_CODES } from '../../src/domain/errors/error-codes';
import { handleError, toErrorResponse } from '../../src/lib/errorHandler';

describe('Errores estándar', () => {
  test('fromCode toma el status y la descripción del catálogo', () => {
    const err = CustomError.fromCode('CAMA_OCUPADA');
    expect(err).toMatchObject({ statusCode: 409, code: 'CAMA_OCUPADA', message: ERROR_CODES.CAMA_OCUPADA.descripcion });
  });

  test('fromCode acepta un mensaje propio', () => {
    expect(CustomError.fromCode('TRANSICION_INVALIDA', 'No se puede volver a pendiente').message).toBe(
      'No se puede volver a pendiente',
    );
  });

  test('sin code explícito usa el genérico de su status', () => {
    expect(new CustomError('x', 404).code).toBe('NO_ENCONTRADO');
    expect(new CustomError('x', 422).code).toBe('REGLA_DE_NEGOCIO');
    expect(CustomError.conflict('x').code).toBe('CONFLICTO');
  });

  test.each([
    ['P2002', 409, 'REGISTRO_DUPLICADO'],
    ['P2003', 400, 'REFERENCIA_INVALIDA'],
    ['P2025', 404, 'NO_ENCONTRADO'],
  ])('traduce el error de Prisma %s', (prismaCode, statusCode, code) => {
    expect(handleError({ code: prismaCode })).toMatchObject({ statusCode, code });
  });

  test('un error desconocido no filtra detalles internos', () => {
    expect(toErrorResponse(new Error('password=1234 en la conexión'))).toEqual({
      statusCode: 500,
      success: false,
      code: 'ERROR_INTERNO',
      message: 'Error interno del servidor',
    });
  });

  test('todos los códigos del catálogo tienen un status de error válido', () => {
    Object.values(ERROR_CODES).forEach(({ status }) => expect([400, 401, 403, 404, 409, 422, 500]).toContain(status));
  });
});
