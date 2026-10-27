import { z } from '../../lib/zod';
import { EstadoCamaSchema, EstadoHospitalizacionSchema, TipoHabitacionSchema } from '../dtos/enums';
import { paginacionQuerySchema } from './common.validator';

const plantaQuery = z.coerce
  .number()
  .int()
  .refine((p) => p === 2 || p === 3, 'La planta es 2 o 3')
  .optional()
  .openapi({ type: 'integer', enum: [2, 3] });

export const listarHabitacionesQuerySchema = z.object({
  planta: plantaQuery,
  tipo: TipoHabitacionSchema.optional(),
});

export const listarCamasQuerySchema = listarHabitacionesQuerySchema.extend({
  estado: EstadoCamaSchema.optional(),
});

export const sugerenciaCamaQuerySchema = z.object({ tipo: TipoHabitacionSchema });

export const cambiarEstadoCamaBodySchema = z
  .object({
    estado: z.enum(['disponible', 'limpieza', 'mantenimiento']).openapi({
      description: '`ocupada` no se pone a mano: la marca la hospitalización.',
    }),
  })
  .openapi('CambiarEstadoCamaBody');

export const crearHospitalizacionBodySchema = z
  .object({
    paciente_id: z.uuid(),
    doctor_tratante_id: z.uuid().openapi({ description: 'Id de personal del doctor' }),
    motivo_ingreso: z.string().max(1000).optional().openapi({ example: 'Observación postoperatoria' }),
    cama_id: z
      .uuid()
      .optional()
      .openapi({ description: 'Cama elegida. Si se omite, se asigna la sugerida para `tipo_habitacion`.' }),
    tipo_habitacion: TipoHabitacionSchema.optional(),
  })
  .refine((b) => b.cama_id || b.tipo_habitacion, {
    message: 'Envía cama_id o tipo_habitacion',
    path: ['cama_id'],
  })
  .openapi('CrearHospitalizacionBody');

export const trasladoBodySchema = z.object({ cama_id: z.uuid() }).openapi('TrasladoBody');

export const altaBodySchema = z
  .object({ notas: z.string().max(2000).optional().openapi({ example: 'Alta médica, control en 7 días' }) })
  .openapi('AltaBody');

export const listarHospitalizacionesQuerySchema = paginacionQuerySchema.extend({
  estado: EstadoHospitalizacionSchema.optional(),
  paciente_id: z.uuid().optional(),
});

export type ListarHabitacionesQuery = z.infer<typeof listarHabitacionesQuerySchema>;
export type ListarCamasQuery = z.infer<typeof listarCamasQuerySchema>;
export type SugerenciaCamaQuery = z.infer<typeof sugerenciaCamaQuerySchema>;
export type CambiarEstadoCamaBody = z.infer<typeof cambiarEstadoCamaBodySchema>;
export type CrearHospitalizacionBody = z.infer<typeof crearHospitalizacionBodySchema>;
export type TrasladoBody = z.infer<typeof trasladoBodySchema>;
export type AltaBody = z.infer<typeof altaBodySchema>;
export type ListarHospitalizacionesQuery = z.infer<typeof listarHospitalizacionesQuerySchema>;
