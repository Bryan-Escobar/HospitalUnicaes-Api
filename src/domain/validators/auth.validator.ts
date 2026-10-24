import { z } from '../../lib/zod';
import { SexoSchema } from '../dtos/enums';
import { passwordSchema, telefonoSchema } from './common.validator';

export const datosPacienteSchema = z.object({
  nombres: z.string().trim().min(1).max(100).openapi({ example: 'Carlos' }),
  apellidos: z.string().trim().min(1).max(100).openapi({ example: 'Martínez Rivas' }),
  documento_identidad: z.string().trim().min(5).max(20).optional().openapi({ example: '01234567-8' }),
  fecha_nacimiento: z.iso.date().optional().openapi({ example: '1990-05-14' }),
  sexo: SexoSchema.optional(),
  telefono: telefonoSchema.optional(),
  direccion: z.string().max(250).optional().openapi({ example: 'Col. Escalón, San Salvador' }),
  contacto_emergencia: z.string().max(150).optional().openapi({ example: 'María Rivas (madre)' }),
  telefono_emergencia: telefonoSchema.optional(),
});

// El rol NO se recibe: el registro público siempre crea un paciente (HUNI-38).
// `alergias` se guarda en expedientes.alergias al crear el expediente (HUNI-96).
export const registroPacienteBodySchema = datosPacienteSchema
  .extend({
    email: z.email().openapi({ example: 'carlos.martinez@correo.com' }),
    password: passwordSchema,
    alergias: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .openapi({ example: 'Penicilina', description: 'Se guarda en el expediente del paciente.' }),
  })
  .openapi('RegistroPacienteBody');

export const actualizarMiPerfilBodySchema = z
  .object({
    nombres: z.string().trim().min(1).max(100),
    apellidos: z.string().trim().min(1).max(100),
    telefono: telefonoSchema.nullable(),
    avatar_url: z.url().nullable(),
  })
  .partial()
  .openapi('ActualizarMiPerfilBody');
