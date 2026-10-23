import { z } from '../../lib/zod';
import { DoctorResumenSchema, fechaHora, PersonaResumenSchema, uuidOut } from './common.dto';
import { EstadoCamaSchema, EstadoHospitalizacionSchema, TipoHabitacionSchema } from './enums';

export const CamaSchema = z
  .object({
    id: uuidOut,
    codigo: z.string().openapi({ example: 'HAB-201-A' }),
    estado: EstadoCamaSchema,
    habitacion: z.object({
      id: uuidOut,
      codigo: z.string().openapi({ example: 'HAB-201' }),
      planta: z.number().int().openapi({ example: 2 }),
      tipo: TipoHabitacionSchema,
    }),
  })
  .openapi('Cama');

export const HabitacionSchema = z
  .object({
    id: uuidOut,
    codigo: z.string().openapi({ example: 'VIP-301' }),
    planta: z.number().int().openapi({ example: 3 }),
    tipo: TipoHabitacionSchema,
    capacidad: z.number().int().openapi({ example: 1 }),
    activa: z.boolean(),
    camas: z.array(
      z.object({
        id: uuidOut,
        codigo: z.string().openapi({ example: 'VIP-301-A' }),
        estado: EstadoCamaSchema,
        ocupante: z
          .object({ hospitalizacion_id: uuidOut, paciente: PersonaResumenSchema, fecha_ingreso: fechaHora })
          .nullable()
          .openapi({ description: 'Paciente actual. Privado: no aparece en los endpoints públicos.' }),
      }),
    ),
  })
  .openapi('Habitacion');

export const HospitalizacionSchema = z
  .object({
    id: uuidOut,
    paciente: PersonaResumenSchema,
    cama: CamaSchema.omit({ estado: true }),
    doctor_tratante: DoctorResumenSchema,
    fecha_ingreso: fechaHora,
    fecha_alta: fechaHora.nullable(),
    motivo_ingreso: z.string().nullable(),
    estado: EstadoHospitalizacionSchema,
  })
  .openapi('Hospitalizacion', { description: 'Privado: la habitación de un paciente no es información pública.' });

const conteo = z.object({
  ocupadas: z.number().int().openapi({ example: 3 }),
  disponibles: z.number().int().openapi({ example: 2 }),
  total: z.number().int().openapi({ example: 5 }),
});

export const OcupacionAgregadaSchema = z
  .object({
    vip: conteo.openapi({ description: '3ª planta: 5 camas' }),
    semiprivada: conteo.openapi({ description: '2ª planta: 12 camas' }),
    total: conteo.openapi({ description: '17 camas' }),
  })
  .openapi('OcupacionAgregada', { description: 'Solo cantidades, sin datos de pacientes.' });
