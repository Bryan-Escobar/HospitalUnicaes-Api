import { z } from '../../lib/zod';
import { signosVitalesSchema } from '../validators/consultas.validator';
import { DoctorResumenSchema, fechaHora, PersonaResumenSchema, uuidOut } from './common.dto';
import { TipoDiagnosticoSchema } from './enums';
import { OrdenLaboratorioResumenSchema } from './laboratorio.dto';
import { ExpedienteSchema, PacienteSchema } from './pacientes.dto';

export const DiagnosticoSchema = z
  .object({
    id: uuidOut,
    consulta_id: uuidOut,
    codigo_cie10: z.string().nullable().openapi({ example: 'K35.8' }),
    descripcion: z.string().openapi({ example: 'Apendicitis aguda' }),
    tipo: TipoDiagnosticoSchema,
    registrado_por: PersonaResumenSchema.openapi({ description: 'Empleado que lo registró (HUNI-57)' }),
    created_at: fechaHora,
  })
  .openapi('Diagnostico');

export const RecetaSchema = z
  .object({
    id: uuidOut,
    consulta_id: uuidOut,
    fecha_emision: fechaHora,
    registrado_por: PersonaResumenSchema.openapi({ description: 'Empleado que la emitió (HUNI-57)' }),
    indicaciones: z.string().nullable(),
    detalles: z.array(
      z.object({
        id: uuidOut,
        medicamento: z.string().openapi({ example: 'Amoxicilina 500 mg' }),
        dosis: z.string().nullable(),
        frecuencia: z.string().nullable(),
        duracion: z.string().nullable(),
        cantidad: z.number().int().nullable(),
        item_id: uuidOut.nullable().openapi({
          description:
            'Referencia opcional al inventario. La receta no descuenta stock: el paciente compra donde quiera.',
        }),
      }),
    ),
  })
  .openapi('Receta');

export const ConsultaSchema = z
  .object({
    id: uuidOut,
    expediente_id: uuidOut,
    paciente: PersonaResumenSchema,
    doctor: DoctorResumenSchema,
    cita_id: uuidOut.nullable(),
    fecha: fechaHora,
    motivo_consulta: z.string().nullable(),
    signos_vitales: signosVitalesSchema.nullable(),
    examen_fisico: z.string().nullable(),
    notas: z.string().nullable(),
    cerrada_en: fechaHora.nullable().openapi({ description: 'null = abierta. Cerrada = ya no se edita.' }),
  })
  .openapi('Consulta', { description: 'Privado: solo médico tratante, el propio paciente y administración.' });

export const ConsultaDetalleSchema = ConsultaSchema.extend({
  diagnosticos: z.array(DiagnosticoSchema),
  recetas: z.array(RecetaSchema),
  ordenes_laboratorio: z.array(OrdenLaboratorioResumenSchema),
}).openapi('ConsultaDetalle');

export const HistorialClinicoSchema = z
  .object({
    paciente: PacienteSchema,
    expediente: ExpedienteSchema,
    consultas: z.array(ConsultaDetalleSchema).openapi({ description: 'De la más reciente a la más antigua' }),
  })
  .openapi('HistorialClinico');
