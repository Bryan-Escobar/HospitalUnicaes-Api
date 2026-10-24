import { z } from '../../lib/zod';
import { datosPacienteSchema } from './auth.validator';
import { booleanQuery, paginacionQuerySchema } from './common.validator';

// Paciente registrado en recepción (sin cuenta). Se crea también su expediente.
export const crearPacienteBodySchema = datosPacienteSchema.openapi('CrearPacienteBody');

export const actualizarPacienteBodySchema = datosPacienteSchema.partial().openapi('ActualizarPacienteBody');

export const listarPacientesQuerySchema = paginacionQuerySchema.extend({
  buscar: z
    .string()
    .trim()
    .min(2)
    .optional()
    .openapi({ description: 'Nombre, apellido o documento', example: 'martínez' }),
  activo: booleanQuery.optional().openapi({ description: 'Por defecto solo activos (`true`)', example: 'true' }),
});

export const actualizarExpedienteBodySchema = z
  .object({
    tipo_sangre: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).nullable(),
    alergias: z.string().max(2000).nullable().openapi({ example: 'Penicilina' }),
    antecedentes: z.string().max(5000).nullable(),
    enfermedades_cronicas: z.string().max(2000).nullable().openapi({ example: 'Hipertensión' }),
  })
  .partial()
  .openapi('ActualizarExpedienteBody');
