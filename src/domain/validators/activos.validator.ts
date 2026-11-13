import { EstadoActivoSchema } from '../dtos/enums';
import { z } from '../../lib/zod';
import { paginacionQuerySchema } from './common.validator';

const ubicacion = z.string().trim().min(1).max(100).nullable().openapi({ example: 'Quirófano 1' });
const notas = z.string().trim().min(1).max(1000).nullable();

export const crearActivoBodySchema = z
  .object({
    item_id: z.uuid().openapi({ description: 'Ítem de categoría `equipo`' }),
    numero_serie: z.string().trim().min(1).max(100).openapi({ description: 'Único por ítem', example: 'MSV-10003' }),
    proveedor_id: z.uuid().openapi({ description: 'Proveedor activo' }),
    estado: EstadoActivoSchema.exclude(['dado_de_baja']).default('disponible'),
    ubicacion: ubicacion.optional(),
    fecha_ingreso: z.iso.date().optional().openapi({ description: 'Por defecto, hoy', example: '2026-11-12' }),
    notas: notas.optional(),
  })
  .strict()
  .openapi('CrearActivoBody');

export const actualizarActivoBodySchema = z
  .object({ estado: EstadoActivoSchema, ubicacion, notas })
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'Envía al menos un campo para actualizar' })
  .openapi('ActualizarActivoBody', {
    description:
      'Solo estado, ubicación y notas. `dado_de_baja` es definitivo: después cualquier cambio → 409 ' +
      '`ACTIVO_DADO_DE_BAJA`.',
  });

export const listarActivosQuerySchema = paginacionQuerySchema
  .extend({
    item_id: z.uuid().optional(),
    proveedor_id: z.uuid().optional(),
    estado: EstadoActivoSchema.optional(),
    buscar: z.string().trim().min(1).max(100).optional().openapi({ description: 'Número de serie o ubicación' }),
  })
  .openapi('ListarActivosQuery');

export type CrearActivoBody = z.infer<typeof crearActivoBodySchema>;
export type ActualizarActivoBody = z.infer<typeof actualizarActivoBodySchema>;
export type ListarActivosQuery = z.infer<typeof listarActivosQuerySchema>;
