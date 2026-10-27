import { echoBodySchema } from '../../domain/validators/health.validator';
import { z } from '../../lib/zod';
import { jsonBody, registerEndpoint, registry } from '../registry';

const HealthStatusSchema = registry.register(
  'HealthStatus',
  z.object({
    status: z.literal('ok'),
    timestamp: z.string().openapi({ format: 'date-time', example: '2026-10-22T12:00:00.000Z' }),
    uptime: z.number().int().openapi({ description: 'Segundos desde que arrancó el proceso', example: 120 }),
    database: z.enum(['up', 'down']).openapi({ description: 'Conectividad con PostgreSQL' }),
  }),
);

registerEndpoint({
  method: 'get',
  path: '/health',
  tag: 'Health',
  summary: 'Estado del servidor',
  description: 'Siempre responde 200 si el proceso está vivo; el estado de la base de datos va en `data.database`.',
  roles: 'publico',
  ticket: 'HUNI-17',
  estado: 'implementado',
  response: { description: 'Servidor operativo', schema: HealthStatusSchema },
});

registerEndpoint({
  method: 'post',
  path: '/health/echo',
  tag: 'Health',
  summary: 'Eco del mensaje (ejemplo de validación con zod)',
  roles: 'publico',
  ticket: 'HUNI-17',
  estado: 'implementado',
  request: { body: jsonBody(echoBodySchema) },
  response: { description: 'Echo exitoso', schema: z.object({ echo: z.string() }) },
});
