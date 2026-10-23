import { z } from '../../lib/zod';
import { fechaHora, PersonaResumenSchema, uuidOut } from './common.dto';
import { EstadoAmbulanciaSchema, EstadoSolicitudSchema, PrioridadSchema, RolSchema } from './enums';

export const SolicitudAmbulanciaSchema = z
  .object({
    id: uuidOut,
    ambulancia_id: uuidOut,
    solicitada_por: PersonaResumenSchema.extend({ rol: RolSchema }),
    paciente: PersonaResumenSchema.nullable(),
    direccion_origen: z.string().openapi({ example: 'Calle Arce #123, San Salvador' }),
    destino: z.string().nullable(),
    descripcion_emergencia: z.string().nullable(),
    prioridad: PrioridadSchema,
    estado: EstadoSolicitudSchema,
    fecha_solicitud: fechaHora,
    fecha_despacho: fechaHora.nullable(),
    fecha_cierre: fechaHora.nullable(),
  })
  .openapi('SolicitudAmbulancia');

export const AmbulanciaSchema = z
  .object({
    id: uuidOut,
    placa: z.string().openapi({ example: 'P-123456' }),
    estado: EstadoAmbulanciaSchema,
    ubicacion_actual: z.string().nullable(),
    updated_at: fechaHora,
    solicitud_activa: SolicitudAmbulanciaSchema.pick({
      id: true,
      prioridad: true,
      estado: true,
      direccion_origen: true,
    })
      .nullable()
      .openapi({ description: 'Servicio en curso, si lo hay' }),
  })
  .openapi('Ambulancia', { description: 'La única ambulancia del hospital.' });

export const BitacoraAmbulanciaSchema = z
  .object({
    id: uuidOut,
    estado_anterior: EstadoAmbulanciaSchema.nullable(),
    estado_nuevo: EstadoAmbulanciaSchema,
    descripcion: z.string().nullable(),
    solicitud: SolicitudAmbulanciaSchema.pick({
      id: true,
      prioridad: true,
      direccion_origen: true,
      destino: true,
      descripcion_emergencia: true,
    }).nullable(),
    created_at: fechaHora,
  })
  .openapi('BitacoraAmbulancia');
