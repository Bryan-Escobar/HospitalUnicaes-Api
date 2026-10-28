import { z } from '../../lib/zod';
import {
  CanalSolicitudSchema,
  EstadoAmbulanciaSchema,
  EstadoSolicitudSchema,
  PrioridadSchema,
  TipoEmergenciaSchema,
} from '../dtos/enums';
import { paginacionQuerySchema, rangoFechasQuerySchema, telefonoSchema } from './common.validator';

// Ubicación: la dirección escrita o las coordenadas del GPS (al menos una).
const ubicacion = {
  direccion_origen: z
    .string()
    .trim()
    .min(3)
    .max(300)
    .optional()
    .openapi({ description: 'Obligatoria si no hay coordenadas', example: 'Calle Arce #123, San Salvador' }),
  latitud: z.number().min(-90).max(90).optional().openapi({ example: 13.9942 }),
  longitud: z.number().min(-180).max(180).optional().openapi({ example: -89.5597 }),
  precision_m: z
    .number()
    .int()
    .min(0)
    .max(100000)
    .optional()
    .openapi({ description: 'Precisión del GPS en metros', example: 15 }),
};

const contacto = {
  telefono_contacto: telefonoSchema.optional(),
  nombre_contacto: z.string().trim().min(1).max(120).optional().openapi({ example: 'Mario (vecino)' }),
  descripcion_emergencia: z.string().max(2000).optional().openapi({ example: 'Dolor de pecho intenso' }),
};

type ConUbicacion = { direccion_origen?: string; latitud?: number; longitud?: number };

const coordenadasCompletas = (b: ConUbicacion) => (b.latitud === undefined) === (b.longitud === undefined);
const tieneUbicacion = (b: ConUbicacion) => Boolean(b.direccion_origen) || b.latitud !== undefined;
const algunCampo = (b: object) => Object.values(b).some((v) => v !== undefined);

export const crearSolicitudBodySchema = z
  .object({
    ...ubicacion,
    ...contacto,
    destino: z.string().max(300).optional().openapi({ example: 'Hospital Universitario Central' }),
    tipo_emergencia: TipoEmergenciaSchema.optional(),
    prioridad: PrioridadSchema.default('urgente'),
    paciente_id: z.uuid().optional().openapi({
      description: 'Solo personal. Si el rol es `paciente`, siempre se usa su propio id.',
    }),
  })
  .refine(coordenadasCompletas, { message: 'Envía latitud y longitud juntas', path: ['longitud'] })
  .refine(tieneUbicacion, { message: 'Envía la dirección o las coordenadas', path: ['direccion_origen'] })
  .openapi('CrearSolicitudAmbulanciaBody');

export const crearSolicitudPublicaBodySchema = z
  .object({ ...ubicacion, ...contacto })
  .refine(coordenadasCompletas, { message: 'Envía latitud y longitud juntas', path: ['longitud'] })
  .refine(tieneUbicacion, { message: 'Envía la dirección o las coordenadas', path: ['direccion_origen'] })
  .openapi('CrearSolicitudAmbulanciaPublicaBody', {
    description:
      'Solo la ubicación es obligatoria (GPS, o la dirección si no hay permiso de ubicación). ' +
      'Teléfono, nombre y descripción se pueden mandar aquí o después con el código de seguimiento.',
  });

export const actualizarSolicitudBodySchema = z
  .object({
    ...contacto,
    direccion_origen: ubicacion.direccion_origen,
    destino: z.string().max(300).optional(),
    tipo_emergencia: TipoEmergenciaSchema.optional(),
    prioridad: PrioridadSchema.optional(),
    paciente_id: z.uuid().nullable().optional().openapi({ description: 'null quita el paciente asignado' }),
  })
  .refine(algunCampo, { message: 'Envía al menos un campo para actualizar' })
  .openapi('ActualizarSolicitudAmbulanciaBody');

export const actualizarSolicitudPublicaBodySchema = z
  .object({ ...contacto, direccion_origen: ubicacion.direccion_origen })
  .refine(algunCampo, { message: 'Envía al menos un campo para actualizar' })
  .openapi('ActualizarSolicitudAmbulanciaPublicaBody');

export const cerrarSolicitudBodySchema = z
  .object({ descripcion: z.string().max(2000).optional().openapi({ example: 'Paciente trasladado a emergencias' }) })
  .openapi('CerrarSolicitudBody');

export const cancelarSolicitudBodySchema = z
  .object({
    motivo: z.string().trim().max(500).optional().openapi({
      description: 'Obligatorio para cancelar una solicitud ya despachada',
      example: 'Falsa alarma',
    }),
  })
  .openapi('CancelarSolicitudBody');

export const cambiarEstadoAmbulanciaBodySchema = z
  .object({
    estado: EstadoAmbulanciaSchema.exclude(['en_servicio']).openapi({
      description: '`en_servicio` no se pone a mano: lo marca el despacho.',
    }),
    descripcion: z.string().max(500).optional().openapi({ example: 'Cambio de llantas' }),
  })
  .openapi('CambiarEstadoAmbulanciaBody');

export const codigoSeguimientoParamSchema = z.object({
  codigo: z
    .string()
    .min(16)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/)
    .openapi({ param: { name: 'codigo', in: 'path' }, example: 'demo-seguimiento-publico-0001' }),
});

export const listarSolicitudesQuerySchema = paginacionQuerySchema.extend(rangoFechasQuerySchema.shape).extend({
  estado: EstadoSolicitudSchema.optional(),
  prioridad: PrioridadSchema.optional(),
  tipo_emergencia: TipoEmergenciaSchema.optional(),
  canal: CanalSolicitudSchema.optional(),
});

export const bitacoraQuerySchema = paginacionQuerySchema.extend(rangoFechasQuerySchema.shape).extend({
  estado: EstadoAmbulanciaSchema.optional().openapi({ description: 'Filtra por estado nuevo' }),
  prioridad: PrioridadSchema.optional().openapi({ description: 'Prioridad de la emergencia asociada' }),
  tipo_emergencia: TipoEmergenciaSchema.optional().openapi({ description: 'Tipo de la emergencia asociada' }),
});

export type CrearSolicitudBody = z.infer<typeof crearSolicitudBodySchema>;
export type CrearSolicitudPublicaBody = z.infer<typeof crearSolicitudPublicaBodySchema>;
export type ActualizarSolicitudBody = z.infer<typeof actualizarSolicitudBodySchema>;
export type ActualizarSolicitudPublicaBody = z.infer<typeof actualizarSolicitudPublicaBodySchema>;
export type CerrarSolicitudBody = z.infer<typeof cerrarSolicitudBodySchema>;
export type CancelarSolicitudBody = z.infer<typeof cancelarSolicitudBodySchema>;
export type CambiarEstadoAmbulanciaBody = z.infer<typeof cambiarEstadoAmbulanciaBodySchema>;
export type ListarSolicitudesQuery = z.infer<typeof listarSolicitudesQuerySchema>;
export type BitacoraQuery = z.infer<typeof bitacoraQuerySchema>;
