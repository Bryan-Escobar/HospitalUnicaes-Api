import { z } from '../../lib/zod';
import { fecha, fechaHora, PersonaResumenSchema, uuidOut } from './common.dto';
import { EstadoActivoSchema } from './enums';

export const ActivoSchema = z
  .object({
    id: uuidOut,
    numero_serie: z.string().openapi({ example: 'MSV-10001' }),
    estado: EstadoActivoSchema,
    ubicacion: z.string().nullable().openapi({ description: 'Texto libre', example: 'VIP-301' }),
    fecha_ingreso: fecha,
    notas: z.string().nullable(),
    item: z.object({
      id: uuidOut,
      codigo: z.string().openapi({ example: 'EQP-0001' }),
      nombre: z.string().openapi({ example: 'Monitor de signos vitales' }),
    }),
    proveedor: z.object({ id: uuidOut, nombre: z.string() }),
    registrado_por: PersonaResumenSchema.openapi({ description: 'Cuenta que lo registró' }),
    created_at: fechaHora,
    updated_at: fechaHora,
  })
  .openapi('Activo');
