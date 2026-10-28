import { z } from '../../lib/zod';
import { fechaHora, PersonaResumenSchema, uuidOut } from './common.dto';
import {
  CanalSolicitudSchema,
  EstadoAmbulanciaSchema,
  EstadoSolicitudSchema,
  PrioridadSchema,
  RolSchema,
  TipoEmergenciaSchema,
} from './enums';

const latitud = z.number().min(-90).max(90).openapi({ example: 13.9942 });
const longitud = z.number().min(-180).max(180).openapi({ example: -89.5597 });

export const SolicitudAmbulanciaSchema = z
  .object({
    id: uuidOut,
    ambulancia_id: uuidOut,
    canal: CanalSolicitudSchema,
    solicitada_por: PersonaResumenSchema.extend({ rol: RolSchema })
      .nullable()
      .openapi({ description: 'Null si llegó por el botón público (sin cuenta).' }),
    paciente: PersonaResumenSchema.nullable(),
    direccion_origen: z.string().nullable().openapi({ example: 'Calle Arce #123, San Salvador' }),
    latitud: latitud.nullable(),
    longitud: longitud.nullable(),
    precision_m: z.number().int().nullable().openapi({ description: 'Precisión del GPS en metros', example: 15 }),
    destino: z.string().nullable(),
    descripcion_emergencia: z.string().nullable(),
    tipo_emergencia: TipoEmergenciaSchema.nullable().openapi({ description: 'Null hasta que alguien lo indique' }),
    prioridad: PrioridadSchema,
    estado: EstadoSolicitudSchema,
    telefono_contacto: z.string().nullable().openapi({ example: '+503 7000-0000' }),
    nombre_contacto: z.string().nullable().openapi({ example: 'Mario (vecino)' }),
    fecha_solicitud: fechaHora,
    fecha_despacho: fechaHora.nullable(),
    fecha_en_curso: fechaHora.nullable(),
    fecha_cierre: fechaHora.nullable().openapi({ description: 'Al finalizar o cancelar' }),
    notas_cierre: z.string().nullable(),
    motivo_cancelacion: z.string().nullable(),
  })
  .openapi('SolicitudAmbulancia');

export const AmbulanciaSchema = z
  .object({
    id: uuidOut,
    placa: z.string().openapi({ example: 'AMB-001' }),
    estado: EstadoAmbulanciaSchema,
    ubicacion_actual: z.string().nullable(),
    updated_at: fechaHora,
    solicitud_activa: SolicitudAmbulanciaSchema.pick({
      id: true,
      prioridad: true,
      estado: true,
      tipo_emergencia: true,
      direccion_origen: true,
      latitud: true,
      longitud: true,
      fecha_despacho: true,
    })
      .nullable()
      .openapi({ description: 'Servicio en curso, si lo hay. Un `paciente` solo lo ve si es suyo.' }),
  })
  .openapi('Ambulancia', { description: 'La única ambulancia del hospital.' });

export const BitacoraAmbulanciaSchema = z
  .object({
    id: uuidOut,
    estado_anterior: EstadoAmbulanciaSchema.nullable(),
    estado_nuevo: EstadoAmbulanciaSchema,
    descripcion: z.string().nullable(),
    registrado_por: PersonaResumenSchema.nullable(),
    solicitud: SolicitudAmbulanciaSchema.pick({
      id: true,
      canal: true,
      estado: true,
      paciente: true,
      tipo_emergencia: true,
      prioridad: true,
      direccion_origen: true,
      latitud: true,
      longitud: true,
      destino: true,
      descripcion_emergencia: true,
      fecha_solicitud: true,
      fecha_despacho: true,
      fecha_cierre: true,
    })
      .nullable()
      .openapi({ description: 'Emergencia atendida (null en los cambios de mantenimiento)' }),
    created_at: fechaHora,
  })
  .openapi('BitacoraAmbulancia');

export const SeguimientoSolicitudPublicaSchema = z
  .object({
    codigo_seguimiento: z.string().openapi({ example: 'b3JkZW4tZGUtcHJ1ZWJhLTAx' }),
    estado: EstadoSolicitudSchema,
    tiene_contacto: z.boolean().openapi({ description: 'Si ya dejó un teléfono (para no volver a pedirlo)' }),
    fecha_solicitud: fechaHora,
    fecha_despacho: fechaHora.nullable(),
    fecha_en_curso: fechaHora.nullable(),
    fecha_cierre: fechaHora.nullable(),
  })
  .openapi('SeguimientoSolicitudPublica', {
    description: 'Lo único que ve quien pidió la ambulancia sin cuenta: el estado y las horas, sin datos de nadie.',
  });
