import { z } from '../../lib/zod';
import { rangoFechasQuerySchema } from '../validators/common.validator';
import { aFechaDb, hoyLocal } from '../../lib/fechas';

export const reportesQuerySchema = rangoFechasQuerySchema
  .required()
  .refine(({ desde, hasta }) => desde <= hasta, { path: ['hasta'], message: 'La fecha final precede a la inicial' })
  .refine(({ hasta }) => hasta <= hoyLocal(), { path: ['hasta'], message: 'La fecha final no puede ser futura' })
  .refine(({ desde, hasta }) => aFechaDb(hasta).getTime() - aFechaDb(desde).getTime() <= 365 * 86_400_000, {
    path: ['hasta'],
    message: 'El rango puede contener hasta 366 días',
  });

export const ReportesSchema = z.object({
  ocupacion: z.array(z.object({ planta: z.number().int(), fecha: z.iso.date(), ocupadas: z.number().int() })),
  citas: z.array(z.object({ doctor_id: z.uuid(), doctor: z.string(), atendidas: z.number().int() })),
  ambulancia: z.array(z.object({ semana: z.iso.date(), servicios: z.number().int() })),
  laboratorio: z.object({ pendiente: z.number().int(), en_proceso: z.number().int(), completado: z.number().int() }),
});

export type ReportesQuery = z.infer<typeof reportesQuerySchema>;
export type Reportes = z.infer<typeof ReportesSchema>;
