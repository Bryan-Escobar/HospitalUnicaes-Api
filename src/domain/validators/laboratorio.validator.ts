import { z } from '../../lib/zod';
import { EstadoLaboratorioSchema, PrioridadSchema } from '../dtos/enums';
import { EJEMPLO_UUID, paginacionQuerySchema, rangoFechasQuerySchema } from './common.validator';

export const crearOrdenBodySchema = z
  .object({
    consulta_id: z.uuid(),
    prioridad: PrioridadSchema.default('normal'),
    indicaciones: z.string().max(2000).optional().openapi({ example: 'Paciente en ayunas' }),
    examen_ids: z.array(z.uuid()).min(1, 'Selecciona al menos un examen').openapi({ description: 'Ids del catálogo' }),
  })
  .openapi('CrearOrdenLaboratorioBody');

export const listarOrdenesQuerySchema = paginacionQuerySchema.extend(rangoFechasQuerySchema.shape).extend({
  estado: EstadoLaboratorioSchema.optional(),
  prioridad: PrioridadSchema.optional(),
  paciente_id: z.uuid().optional(),
});

export const ordenExamenParamsSchema = z.object({
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' }, description: 'Id de la orden', example: EJEMPLO_UUID }),
  orden_examen_id: z
    .uuid()
    .openapi({ param: { name: 'orden_examen_id', in: 'path' }, description: 'Id del examen dentro de la orden' }),
});

export const cambiarEstadoExamenBodySchema = z
  .object({
    estado: z.literal('en_proceso').openapi({
      description: 'Solo `pendiente → en_proceso`. Para pasar a `completado` se registra el resultado.',
    }),
  })
  .openapi('CambiarEstadoExamenBody');

// multipart/form-data: al menos `valor` o `archivo`.
export const registrarResultadoBodySchema = z
  .object({
    valor: z.string().max(2000).optional().openapi({ example: '13.5' }),
    unidad: z.string().max(50).optional().openapi({ example: 'g/dL' }),
    rango_referencia: z.string().max(100).optional().openapi({ example: '12.0 - 15.5' }),
    observaciones: z.string().max(2000).optional(),
    archivo: z.any().optional().openapi({ type: 'string', format: 'binary', description: 'PDF, máximo 10 MB' }),
  })
  .openapi('RegistrarResultadoBody');
