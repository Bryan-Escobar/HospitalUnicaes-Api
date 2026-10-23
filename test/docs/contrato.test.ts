import SwaggerParser from '@apidevtools/swagger-parser';
import request from 'supertest';
import { buildOpenApiDocument } from '../../src/docs/openapi';
import { ERROR_CODE_LIST } from '../../src/domain/errors/error-codes';
import { app } from '../helpers/app';

type Operation = {
  tags?: string[];
  summary?: string;
  security?: Record<string, string[]>[];
  responses: Record<string, { content?: Record<string, { schema?: { $ref?: string } }> }>;
  'x-roles'?: string[];
  'x-ticket'?: string;
  'x-estado'?: 'pendiente' | 'implementado';
};

const doc = buildOpenApiDocument();
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const operations = Object.entries(doc.paths).flatMap(([path, item]) =>
  METHODS.filter((m) => (item as Record<string, unknown>)[m]).map((method) => ({
    path,
    method,
    op: (item as Record<string, Operation>)[method],
  })),
);

describe('Contrato OpenAPI v1', () => {
  test('es un documento OpenAPI 3 válido', async () => {
    await expect(SwaggerParser.validate(structuredClone(doc) as never)).resolves.toBeDefined();
  });

  test.each([
    ['Auth', 'get', '/api/auth/me'],
    ['Pacientes', 'get', '/api/pacientes'],
    ['Personal', 'get', '/api/personal'],
    ['Consultas', 'post', '/api/consultas'],
    ['Laboratorio', 'post', '/api/laboratorio/ordenes'],
    ['Habitaciones', 'post', '/api/hospitalizaciones'],
    ['Ambulancia', 'post', '/api/ambulancia/solicitudes/{id}/despachar'],
    ['Dashboard', 'get', '/api/dashboard/resumen'],
    ['Público', 'get', '/api/publico/estado'],
  ])('incluye el módulo %s (%s %s)', (tag, method, path) => {
    const op = operations.find((o) => o.method === method && o.path === path);
    expect(op).toBeDefined();
    expect(op?.op.tags).toContain(tag);
  });

  test('documenta el catálogo completo de códigos de error', () => {
    const schemas = doc.components?.schemas as Record<string, { enum?: string[]; properties?: object }>;
    expect(schemas.CodigoError.enum).toEqual(ERROR_CODE_LIST);
    expect(Object.keys(schemas.ApiError.properties ?? {})).toEqual(
      expect.arrayContaining(['statusCode', 'success', 'code', 'message', 'errors']),
    );
  });

  describe.each(operations)('$method $path', ({ path, op }) => {
    test('tiene tag, resumen, ticket, estado y roles', () => {
      expect(op.tags?.length).toBe(1);
      expect(op.summary).toBeTruthy();
      expect(op['x-ticket']).toMatch(/^HUNI-\d+$/);
      expect(['pendiente', 'implementado']).toContain(op['x-estado']);
      expect(Array.isArray(op['x-roles'])).toBe(true);
    });

    test('los errores usan el formato ApiError', () => {
      Object.entries(op.responses)
        .filter(([status]) => Number(status) >= 400)
        .forEach(([, res]) => {
          expect(res.content?.['application/json']?.schema?.$ref).toBe('#/components/schemas/ApiError');
        });
    });

    test('si requiere sesión, declara bearerAuth, 401 y 403', () => {
      const publico = op['x-roles']?.length === 0;
      if (publico) {
        expect(op.security).toEqual([]);
      } else {
        expect(op.security).toEqual([{ bearerAuth: [] }]);
        expect(op.responses).toHaveProperty('401');
        expect(op.responses).toHaveProperty('403');
      }
      if (path.includes('{')) expect(op.responses).toHaveProperty('404');
    });
  });
});

// Mantiene honesto el campo x-estado: al implementar una ruta hay que marcarla como implementada.
describe('x-estado coincide con la API real', () => {
  const urlDePrueba = (path: string) => path.replace(/\{[^}]+\}/g, '3f1c2a9e-7b4d-4c1e-9f0a-2d6b8e5c1a7f');

  test.each(operations.map((o) => [o.op['x-estado'], o.method, o.path] as const))(
    '%s: %s %s',
    async (estado, method, path) => {
      const res = await request(app)[method](urlDePrueba(path)).send({});
      const rutaNoExiste = res.status === 404 && res.body.code === 'RUTA_NO_ENCONTRADA';
      expect(rutaNoExiste).toBe(estado === 'pendiente');
    },
  );
});
