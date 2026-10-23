import { z } from '../../lib/zod';
import { fechaHora, uuidOut } from './common.dto';
import { RolSchema, TipoPersonalSchema } from './enums';

export const PerfilSchema = z
  .object({
    id: uuidOut.openapi({ description: 'Mismo id que el usuario de Supabase Auth' }),
    email: z.email().nullable().openapi({ example: 'ana.lopez@hospital.sv' }),
    nombres: z.string().openapi({ example: 'Ana María' }),
    apellidos: z.string().openapi({ example: 'López Hernández' }),
    telefono: z.string().nullable(),
    avatar_url: z.string().nullable(),
    rol: RolSchema,
    activo: z.boolean(),
    created_at: fechaHora,
  })
  .openapi('Perfil');

export const MeSchema = PerfilSchema.extend({
  paciente_id: uuidOut.nullable().openapi({ description: 'Solo si el rol es `paciente`' }),
  personal: z
    .object({
      id: uuidOut,
      tipo: TipoPersonalSchema,
      especialidad: z.string().nullable().openapi({ example: 'Pediatría' }),
      codigo_empleado: z.string().openapi({ example: 'EMP-0042' }),
    })
    .nullable()
    .openapi({ description: 'Solo para personal del hospital' }),
}).openapi('Me');
