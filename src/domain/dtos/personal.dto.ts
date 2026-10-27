import { z } from '../../lib/zod';
import { fecha, uuidOut } from './common.dto';
import { RolSchema } from './enums';

export const EspecialidadSchema = z
  .object({
    id: uuidOut,
    nombre: z.string().openapi({ example: 'Pediatría' }),
    descripcion: z.string().nullable(),
  })
  .openapi('Especialidad');

export const TipoPersonalSchema = z
  .object({
    id: uuidOut,
    nombre: z.string().openapi({ example: 'Enfermero/a' }),
    rol_sugerido: RolSchema.nullable().openapi({
      description: 'Rol que se sugiere al crear la cuenta de un empleado de este tipo (HUNI-95)',
    }),
    es_medico: z.boolean().openapi({ description: 'Si aparece en "médicos de turno" del endpoint público' }),
    activo: z.boolean(),
  })
  .openapi('TipoPersonal', {
    description: 'Catálogo editable de tipos de personal. El tipo no da permisos: solo etiqueta turnos y filtros.',
  });

export const TipoPersonalResumenSchema = TipoPersonalSchema.pick({ id: true, nombre: true }).openapi(
  'TipoPersonalResumen',
);

export const PersonalSchema = z
  .object({
    id: uuidOut,
    perfil_id: uuidOut.nullable().openapi({ description: 'Cuenta de acceso. null = empleado sin login' }),
    nombres: z.string().openapi({ example: 'Ana María' }),
    apellidos: z.string().openapi({ example: 'López Hernández' }),
    email: z.email().nullable(),
    telefono: z.string().nullable(),
    rol: RolSchema.nullable().openapi({ description: 'Rol de su cuenta; null si no tiene cuenta' }),
    tipo: TipoPersonalResumenSchema,
    especialidad: EspecialidadSchema.pick({ id: true, nombre: true }).nullable(),
    codigo_empleado: z.string().openapi({ example: 'EMP-0042' }),
    num_licencia: z.string().nullable(),
    fecha_contratacion: fecha.nullable(),
    activo: z.boolean(),
  })
  .openapi('Personal');
