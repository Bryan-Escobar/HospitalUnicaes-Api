import { z } from '../../lib/zod';
import { TipoDiagnosticoSchema } from '../dtos/enums';
import { paginacionQuerySchema, rangoFechasQuerySchema } from './common.validator';

export const signosVitalesSchema = z
  .object({
    presion_arterial: z
      .string()
      .regex(/^\d{2,3}\/\d{2,3}$/, 'Formato sistólica/diastólica, p. ej. 120/80')
      .openapi({ example: '120/80' }),
    frecuencia_cardiaca: z.number().int().min(20).max(250).openapi({ description: 'lpm', example: 78 }),
    frecuencia_respiratoria: z.number().int().min(5).max(80).openapi({ description: 'rpm', example: 16 }),
    temperatura: z.number().min(30).max(45).openapi({ description: '°C', example: 36.8 }),
    saturacion_oxigeno: z.number().int().min(50).max(100).openapi({ description: '%', example: 98 }),
    peso_kg: z.number().positive().max(400).openapi({ example: 72.5 }),
    talla_cm: z.number().positive().max(250).openapi({ example: 170 }),
  })
  .partial()
  .openapi('SignosVitales');

const datosConsulta = z.object({
  motivo_consulta: z.string().max(1000).optional().openapi({ example: 'Dolor abdominal de 2 días' }),
  signos_vitales: signosVitalesSchema.optional(),
  examen_fisico: z.string().max(5000).optional(),
  notas: z.string().max(5000).optional(),
});

// El doctor sale del token; el expediente, del paciente.
export const crearConsultaBodySchema = datosConsulta
  .extend({
    paciente_id: z.uuid(),
    cita_id: z.uuid().optional().openapi({ description: 'Si la consulta atiende una cita, esta pasa a `atendida`' }),
  })
  .openapi('CrearConsultaBody');

export const actualizarConsultaBodySchema = datosConsulta.openapi('ActualizarConsultaBody');

export const listarConsultasQuerySchema = paginacionQuerySchema.extend(rangoFechasQuerySchema.shape).extend({
  paciente_id: z.uuid().optional(),
  doctor_id: z.uuid().optional(),
});

export const crearDiagnosticoBodySchema = z
  .object({
    codigo_cie10: z
      .string()
      .regex(/^[A-Z]\d{2}(\.\d{1,2})?$/, 'Código CIE-10 inválido, p. ej. K35.8')
      .optional()
      .openapi({ example: 'K35.8' }),
    descripcion: z.string().trim().min(1).max(1000).openapi({ example: 'Apendicitis aguda' }),
    tipo: TipoDiagnosticoSchema.default('principal'),
  })
  .openapi('CrearDiagnosticoBody');

export const crearRecetaBodySchema = z
  .object({
    indicaciones: z.string().max(2000).optional().openapi({ example: 'Tomar con alimentos' }),
    detalles: z
      .array(
        z.object({
          medicamento: z.string().trim().min(1).max(200).openapi({ example: 'Amoxicilina 500 mg' }),
          dosis: z.string().max(100).optional().openapi({ example: '1 cápsula' }),
          frecuencia: z.string().max(100).optional().openapi({ example: 'Cada 8 horas' }),
          duracion: z.string().max(100).optional().openapi({ example: '7 días' }),
          cantidad: z.number().int().positive().optional().openapi({ example: 21 }),
          item_id: z.uuid().optional().openapi({ description: 'Ítem del inventario, si aplica' }),
        }),
      )
      .min(1, 'La receta necesita al menos un medicamento'),
  })
  .openapi('CrearRecetaBody');

export type CrearConsultaBody = z.infer<typeof crearConsultaBodySchema>;
export type ActualizarConsultaBody = z.infer<typeof actualizarConsultaBodySchema>;
export type ListarConsultasQuery = z.infer<typeof listarConsultasQuerySchema>;
export type CrearDiagnosticoBody = z.infer<typeof crearDiagnosticoBodySchema>;
export type CrearRecetaBody = z.infer<typeof crearRecetaBodySchema>;
