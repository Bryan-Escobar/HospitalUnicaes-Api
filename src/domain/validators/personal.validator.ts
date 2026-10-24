import { z } from '../../lib/zod';
import { booleanQuery, paginacionQuerySchema, passwordSchema, telefonoSchema } from './common.validator';

const datosPersonal = z.object({
  nombres: z.string().trim().min(1).max(100).openapi({ example: 'Ana María' }),
  apellidos: z.string().trim().min(1).max(100).openapi({ example: 'López Hernández' }),
  telefono: telefonoSchema.optional(),
  tipo_personal_id: z.uuid().openapi({ description: 'Id del catálogo de tipos de personal' }),
  especialidad_id: z.uuid().nullable().optional(),
  codigo_empleado: z.string().trim().min(1).max(30).openapi({ example: 'EMP-0042' }),
  num_licencia: z.string().max(50).nullable().optional().openapi({ example: 'JVPM-12345' }),
  fecha_contratacion: z.iso.date().nullable().optional(),
});

const rolCuenta = z
  .enum(['administrador', 'doctor', 'recepcionista'])
  .openapi({ description: 'Rol de la cuenta. Si se omite, se usa el `rol_sugerido` del tipo de personal.' });

// La cuenta es opcional (HUNI-34): sin `email`, el empleado solo aparece en turnos.
// Con `email`, el administrador crea la cuenta en Supabase Auth (service role) con una contraseña temporal.
export const crearPersonalBodySchema = datosPersonal
  .extend({
    email: z.email().optional().openapi({ example: 'ana.lopez@hospital.sv' }),
    password: passwordSchema
      .optional()
      .openapi({ description: 'Contraseña temporal. Obligatoria si se envía `email`.' }),
    rol: rolCuenta.optional(),
  })
  .refine((b) => !b.email || b.password, {
    message: 'La contraseña es obligatoria al crear la cuenta',
    path: ['password'],
  })
  .refine((b) => b.email || (!b.password && !b.rol), {
    message: 'Para crear la cuenta envía también el email',
    path: ['email'],
  })
  .openapi('CrearPersonalBody');

export const actualizarPersonalBodySchema = datosPersonal
  .extend({ activo: z.boolean(), rol: rolCuenta.openapi({ description: 'Solo si el empleado tiene cuenta' }) })
  .partial()
  .openapi('ActualizarPersonalBody');

export const listarPersonalQuerySchema = paginacionQuerySchema.extend({
  buscar: z.string().trim().min(2).optional().openapi({ description: 'Nombre, apellido o código de empleado' }),
  tipo_personal_id: z.uuid().optional(),
  especialidad_id: z.uuid().optional(),
  activo: booleanQuery.optional().openapi({ description: 'Por defecto devuelve todos', example: 'true' }),
});

export const crearTipoPersonalBodySchema = z
  .object({
    nombre: z.string().trim().min(1).max(60).openapi({ example: 'Nutricionista' }),
    rol_sugerido: z.enum(['administrador', 'doctor', 'recepcionista']).nullable().default(null),
    es_medico: z.boolean().default(false),
  })
  .openapi('CrearTipoPersonalBody');

export const actualizarTipoPersonalBodySchema = crearTipoPersonalBodySchema
  .extend({
    activo: z.boolean().openapi({ description: 'Desactivar en vez de borrar: puede haber personal con ese tipo' }),
  })
  .partial()
  .openapi('ActualizarTipoPersonalBody');
