import { z } from '../../lib/zod';
import { TipoPersonalSchema } from '../dtos/enums';
import { booleanQuery, paginacionQuerySchema, passwordSchema, telefonoSchema } from './common.validator';

const datosPersonal = z.object({
  nombres: z.string().trim().min(1).max(100).openapi({ example: 'Ana María' }),
  apellidos: z.string().trim().min(1).max(100).openapi({ example: 'López Hernández' }),
  telefono: telefonoSchema.optional(),
  rol: z
    .enum(['administrador', 'doctor', 'recepcionista'])
    .openapi({ description: 'Rol de la cuenta. Mapeo sugerido por tipo en HUNI-95.' }),
  tipo: TipoPersonalSchema,
  especialidad_id: z.uuid().nullable().optional(),
  codigo_empleado: z.string().trim().min(1).max(30).openapi({ example: 'EMP-0042' }),
  num_licencia: z.string().max(50).nullable().optional().openapi({ example: 'JVPM-12345' }),
  fecha_contratacion: z.iso.date().nullable().optional(),
});

// El administrador crea la cuenta (Supabase Auth con service role) y el registro de personal.
export const crearPersonalBodySchema = datosPersonal
  .extend({
    email: z.email().openapi({ example: 'ana.lopez@hospital.sv' }),
    password: passwordSchema.openapi({ description: 'Contraseña temporal; el empleado la cambia al entrar.' }),
  })
  .openapi('CrearPersonalBody');

export const actualizarPersonalBodySchema = datosPersonal
  .extend({ activo: z.boolean() })
  .partial()
  .openapi('ActualizarPersonalBody');

export const listarPersonalQuerySchema = paginacionQuerySchema.extend({
  buscar: z.string().trim().min(2).optional().openapi({ description: 'Nombre, apellido o código de empleado' }),
  tipo: TipoPersonalSchema.optional(),
  especialidad_id: z.uuid().optional(),
  activo: booleanQuery.optional().openapi({ description: 'Por defecto devuelve todos', example: 'true' }),
});
