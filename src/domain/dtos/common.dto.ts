import { z } from '../../lib/zod';
import { EJEMPLO_UUID } from '../validators/common.validator';

export const uuidOut = z.uuid().openapi({ example: EJEMPLO_UUID });
export const fechaHora = z.iso.datetime({ offset: true }).openapi({ example: '2026-11-03T14:30:00.000Z' });
export const fecha = z.iso.date().openapi({ example: '2026-11-03' });

export const PersonaResumenSchema = z
  .object({
    id: uuidOut,
    nombres: z.string().openapi({ example: 'Ana María' }),
    apellidos: z.string().openapi({ example: 'López Hernández' }),
  })
  .openapi('PersonaResumen');

export const DoctorResumenSchema = PersonaResumenSchema.extend({
  especialidad: z.string().nullable().openapi({ example: 'Medicina interna' }),
}).openapi('DoctorResumen');
