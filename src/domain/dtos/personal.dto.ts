import { z } from '../../lib/zod';
import { fecha, uuidOut } from './common.dto';
import { RolSchema, TipoPersonalSchema } from './enums';

export const EspecialidadSchema = z
  .object({
    id: uuidOut,
    nombre: z.string().openapi({ example: 'Pediatría' }),
    descripcion: z.string().nullable(),
  })
  .openapi('Especialidad');

export const PersonalSchema = z
  .object({
    id: uuidOut,
    perfil_id: uuidOut,
    nombres: z.string().openapi({ example: 'Ana María' }),
    apellidos: z.string().openapi({ example: 'López Hernández' }),
    email: z.email().nullable(),
    telefono: z.string().nullable(),
    rol: RolSchema,
    tipo: TipoPersonalSchema,
    especialidad: EspecialidadSchema.pick({ id: true, nombre: true }).nullable(),
    codigo_empleado: z.string().openapi({ example: 'EMP-0042' }),
    num_licencia: z.string().nullable(),
    fecha_contratacion: fecha.nullable(),
    activo: z.boolean(),
  })
  .openapi('Personal');
