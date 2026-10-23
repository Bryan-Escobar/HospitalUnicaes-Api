import { z } from '../../lib/zod';
import { echoBodySchema } from '../../domain/validators/health.validator';
import { apiResponse, errorResponse, registry } from '../registry';

const HealthStatusSchema = registry.register(
  'HealthStatus',
  z.object({
    status: z.literal('ok'),
    timestamp: z.string().openapi({ format: 'date-time', example: '2026-10-22T12:00:00.000Z' }),
    uptime: z.number().int().openapi({ description: 'Segundos desde que arrancó el proceso', example: 120 }),
    database: z.enum(['up', 'down']).openapi({ description: 'Conectividad con PostgreSQL' }),
  }),
);

registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['Health'],
  summary: 'Estado del servidor',
  description: 'Siempre responde 200 si el proceso está vivo; el estado de la base de datos va en `data.database`.',
  responses: {
    200: {
      description: 'Servidor operativo',
      content: { 'application/json': { schema: apiResponse(HealthStatusSchema) } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/health/echo',
  tags: ['Health'],
  summary: 'Eco del mensaje (ejemplo de validación con zod)',
  request: {
    body: { content: { 'application/json': { schema: echoBodySchema } } },
  },
  responses: {
    200: {
      description: 'Echo exitoso',
      content: { 'application/json': { schema: apiResponse(z.object({ echo: z.string() })) } },
    },
    400: errorResponse('Body inválido'),
  },
});
