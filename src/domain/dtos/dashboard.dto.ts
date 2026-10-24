import { z } from '../../lib/zod';
import { fechaHora, uuidOut } from './common.dto';
import { EstadoAmbulanciaSchema, EstadoCitaSchema } from './enums';
import { OcupacionAgregadaSchema } from './habitaciones.dto';

export const ResumenDashboardSchema = z
  .object({
    ocupacion: OcupacionAgregadaSchema,
    personal_de_turno: z.object({
      total: z.number().int().openapi({ example: 14 }),
      por_tipo: z.array(z.object({ tipo: z.string().openapi({ example: 'Enfermero/a' }), cantidad: z.number().int() })),
    }),
    ambulancia: z.object({ estado: EstadoAmbulanciaSchema, solicitud_activa_id: uuidOut.nullable() }),
    citas_hoy: z.object({
      total: z.number().int().openapi({ example: 32 }),
      por_estado: z.array(z.object({ estado: EstadoCitaSchema, cantidad: z.number().int() })),
    }),
    laboratorio: z.object({
      pendientes: z.number().int().openapi({ example: 6 }),
      en_proceso: z.number().int().openapi({ example: 2 }),
    }),
    inventario_bajo_minimo: z
      .number()
      .int()
      .openapi({ description: 'Ítems con stock por debajo del mínimo', example: 3 }),
    generado_en: fechaHora,
  })
  .openapi('ResumenDashboard');

export const MedicoDeTurnoSchema = z
  .object({
    nombres: z.string().openapi({ example: 'Ana María' }),
    apellidos: z.string().openapi({ example: 'López Hernández' }),
    tipo: z.string().openapi({ description: 'Nombre del tipo de personal', example: 'Doctor' }),
    especialidad: z.string().nullable().openapi({ example: 'Pediatría' }),
    area: z.string().openapi({ example: 'Emergencia' }),
    hora_inicio: z.iso.time().openapi({ example: '07:00:00' }),
    hora_fin: z.iso.time().openapi({ example: '15:00:00' }),
  })
  .openapi('MedicoDeTurno');

export const AvisoPublicoSchema = z
  .object({
    id: uuidOut,
    titulo: z.string().openapi({ example: 'Jornada de vacunación' }),
    contenido: z.string(),
    fecha_publicacion: fechaHora,
    fecha_expiracion: fechaHora.nullable(),
  })
  .openapi('AvisoPublico');

export const EstadoPublicoSchema = z
  .object({
    ocupacion: OcupacionAgregadaSchema,
    medicos_de_turno: z.array(MedicoDeTurnoSchema),
    avisos: z.array(AvisoPublicoSchema).openapi({ description: 'Solo avisos públicos y vigentes' }),
    actualizado_en: fechaHora,
  })
  .openapi('EstadoPublico', {
    description: 'Información pública (context.md §3.4): sin nombres de pacientes ni habitaciones asignadas.',
  });
