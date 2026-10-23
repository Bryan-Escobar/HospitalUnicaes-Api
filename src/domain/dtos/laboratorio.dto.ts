import { z } from '../../lib/zod';
import { DoctorResumenSchema, fechaHora, PersonaResumenSchema, uuidOut } from './common.dto';
import { EstadoLaboratorioSchema, PrioridadSchema } from './enums';

export const ExamenCatalogoSchema = z
  .object({
    id: uuidOut,
    nombre: z.string().openapi({ example: 'Hemograma completo' }),
    categoria: z.string().nullable().openapi({ example: 'Hematología' }),
    tipo_muestra: z.string().nullable().openapi({ example: 'Sangre venosa' }),
    tiempo_entrega_horas: z.number().int().nullable().openapi({ example: 24 }),
    activo: z.boolean(),
  })
  .openapi('ExamenCatalogo');

export const ResultadoLaboratorioSchema = z
  .object({
    id: uuidOut,
    valor: z.string().nullable().openapi({ example: '13.5' }),
    unidad: z.string().nullable().openapi({ example: 'g/dL' }),
    rango_referencia: z.string().nullable().openapi({ example: '12.0 - 15.5' }),
    observaciones: z.string().nullable(),
    tiene_archivo: z.boolean().openapi({ description: 'Si hay PDF; se descarga con el endpoint de archivo' }),
    validado_por: PersonaResumenSchema.nullable(),
    fecha_resultado: fechaHora,
  })
  .openapi('ResultadoLaboratorio');

export const OrdenExamenSchema = z
  .object({
    id: uuidOut,
    examen: ExamenCatalogoSchema.pick({ id: true, nombre: true, tipo_muestra: true }),
    estado: EstadoLaboratorioSchema,
    fecha_inicio: fechaHora.nullable(),
    fecha_completado: fechaHora.nullable(),
    resultado: ResultadoLaboratorioSchema.nullable(),
  })
  .openapi('OrdenExamen');

export const OrdenLaboratorioResumenSchema = z
  .object({
    id: uuidOut,
    fecha_solicitud: fechaHora,
    prioridad: PrioridadSchema,
    estado: EstadoLaboratorioSchema.openapi({
      description: 'Derivado de sus exámenes: completado cuando todos lo están',
    }),
    total_examenes: z.number().int().openapi({ example: 3 }),
  })
  .openapi('OrdenLaboratorioResumen');

export const OrdenLaboratorioSchema = OrdenLaboratorioResumenSchema.omit({ total_examenes: true })
  .extend({
    consulta_id: uuidOut,
    paciente: PersonaResumenSchema,
    doctor: DoctorResumenSchema,
    indicaciones: z.string().nullable(),
    examenes: z.array(OrdenExamenSchema),
  })
  .openapi('OrdenLaboratorio', { description: 'Privado: solo médico tratante, el propio paciente y administración.' });

export const ArchivoFirmadoSchema = z
  .object({
    url: z.url().openapi({ description: 'URL firmada de Supabase Storage' }),
    expira_en: fechaHora,
  })
  .openapi('ArchivoFirmado');
