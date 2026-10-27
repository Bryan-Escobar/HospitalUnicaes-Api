import { z } from '../../lib/zod';
import { EstadoAmbulanciaSchema, EstadoSolicitudSchema, PrioridadSchema } from '../dtos/enums';
import { paginacionQuerySchema, rangoFechasQuerySchema } from './common.validator';

export const crearSolicitudBodySchema = z
  .object({
    direccion_origen: z.string().trim().min(5).max(300).openapi({ example: 'Calle Arce #123, San Salvador' }),
    destino: z.string().max(300).optional().openapi({ example: 'Hospital Universitario Central' }),
    descripcion_emergencia: z.string().max(2000).optional().openapi({ example: 'Dolor de pecho intenso' }),
    prioridad: PrioridadSchema.default('urgente'),
    paciente_id: z.uuid().optional().openapi({
      description: 'Solo personal. Si el rol es `paciente`, siempre se usa su propio id.',
    }),
  })
  .openapi('CrearSolicitudAmbulanciaBody');

export const cerrarSolicitudBodySchema = z
  .object({ descripcion: z.string().max(2000).optional().openapi({ example: 'Paciente trasladado a emergencias' }) })
  .openapi('CerrarSolicitudBody');

export const cancelarSolicitudBodySchema = z
  .object({ motivo: z.string().max(500).optional().openapi({ example: 'Solicitud duplicada' }) })
  .openapi('CancelarSolicitudBody');

export const cambiarEstadoAmbulanciaBodySchema = z
  .object({
    estado: EstadoAmbulanciaSchema.exclude(['en_servicio']).openapi({
      description: '`en_servicio` no se pone a mano: lo marca el despacho.',
    }),
    descripcion: z.string().max(500).optional().openapi({ example: 'Cambio de llantas' }),
  })
  .openapi('CambiarEstadoAmbulanciaBody');

export const listarSolicitudesQuerySchema = paginacionQuerySchema.extend(rangoFechasQuerySchema.shape).extend({
  estado: EstadoSolicitudSchema.optional(),
  prioridad: PrioridadSchema.optional(),
});

export const bitacoraQuerySchema = paginacionQuerySchema.extend(rangoFechasQuerySchema.shape).extend({
  estado: EstadoAmbulanciaSchema.optional().openapi({ description: 'Filtra por estado nuevo' }),
  prioridad: PrioridadSchema.optional().openapi({ description: 'Prioridad de la emergencia asociada' }),
});
