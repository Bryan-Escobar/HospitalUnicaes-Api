import { z } from '../../lib/zod';
import { fecha, fechaHora, uuidOut } from './common.dto';
import { SexoSchema } from './enums';

export const PacienteSchema = z
  .object({
    id: uuidOut,
    perfil_id: uuidOut
      .nullable()
      .openapi({ description: 'null si el paciente no tiene cuenta (registrado en recepción)' }),
    nombres: z.string().openapi({ example: 'Carlos' }),
    apellidos: z.string().openapi({ example: 'Martínez Rivas' }),
    documento_identidad: z.string().nullable().openapi({ example: '01234567-8' }),
    fecha_nacimiento: fecha.nullable(),
    sexo: SexoSchema.nullable(),
    telefono: z.string().nullable(),
    direccion: z.string().nullable(),
    contacto_emergencia: z.string().nullable(),
    telefono_emergencia: z.string().nullable(),
    numero_expediente: z.string().openapi({ example: 'EXP-2026-00015' }),
    created_at: fechaHora,
  })
  .openapi('Paciente', {
    description: 'Datos personales: privados (solo paciente, tratante, recepción y administración).',
  });

export const ExpedienteSchema = z
  .object({
    id: uuidOut,
    paciente_id: uuidOut,
    numero_expediente: z.string().openapi({ example: 'EXP-2026-00015' }),
    tipo_sangre: z.string().nullable().openapi({ example: 'O+' }),
    alergias: z.string().nullable(),
    antecedentes: z.string().nullable(),
    enfermedades_cronicas: z.string().nullable(),
    created_at: fechaHora,
    updated_at: fechaHora,
  })
  .openapi('Expediente', { description: 'Privado: solo médico tratante, el propio paciente y administración.' });
