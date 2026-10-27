import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import { ordenResumenInclude } from './laboratorio.repository';

const persona = { select: { id: true, nombres: true, apellidos: true } } as const;

export const doctorInclude = {
  select: { id: true, nombres: true, apellidos: true, especialidades: { select: { nombre: true } } },
} as const;

/** Consulta con su paciente (vía expediente) y su doctor. */
const consultaInclude = {
  expedientes: { select: { paciente_id: true, pacientes: persona } },
  personal: doctorInclude,
} satisfies Prisma.consultasInclude;

/** Consulta con diagnósticos, recetas y órdenes de laboratorio (en orden de registro). */
const consultaDetalleInclude = {
  ...consultaInclude,
  diagnosticos: { include: { personal: persona }, orderBy: { created_at: 'asc' } },
  recetas: { include: { personal: persona, receta_detalles: true }, orderBy: { fecha_emision: 'asc' } },
  ordenes_laboratorio: { include: ordenResumenInclude, orderBy: { fecha_solicitud: 'asc' } },
} satisfies Prisma.consultasInclude;

const diagnosticoInclude = { personal: persona } satisfies Prisma.diagnosticosInclude;
const recetaInclude = { personal: persona, receta_detalles: true } satisfies Prisma.recetasInclude;

export type ConsultaConRelaciones = Prisma.consultasGetPayload<{ include: typeof consultaInclude }>;
export type ConsultaDetalle = Prisma.consultasGetPayload<{ include: typeof consultaDetalleInclude }>;
export type DiagnosticoConAutor = Prisma.diagnosticosGetPayload<{ include: typeof diagnosticoInclude }>;
export type RecetaConDetalles = Prisma.recetasGetPayload<{ include: typeof recetaInclude }>;
export type Expediente = Prisma.expedientesGetPayload<object>;

/** Lo mínimo para decidir permisos: autor, estado y paciente de la consulta. */
export interface ConsultaBase {
  id: string;
  doctor_id: string;
  cerrada_en: Date | null;
  paciente_id: string;
  paciente_perfil_id: string | null;
}

export interface FiltroConsultas {
  doctorId?: string;
  pacienteId?: string;
  /** Solo las del paciente con esta cuenta (rol paciente). */
  perfilPaciente?: string;
  desde?: Date;
  hastaExclusivo?: Date;
}

export interface DatosConsulta {
  motivo_consulta?: string;
  signos_vitales?: Record<string, unknown>;
  examen_fisico?: string;
  notas?: string;
}

export interface DatosDiagnostico {
  codigo_cie10?: string;
  descripcion: string;
  tipo: 'principal' | 'secundario';
}

export interface DatosReceta {
  indicaciones?: string;
  detalles: {
    medicamento: string;
    dosis?: string;
    frecuencia?: string;
    duracion?: string;
    cantidad?: number;
    item_id?: string;
  }[];
}

const construirWhere = (f: FiltroConsultas): Prisma.consultasWhereInput => ({
  ...(f.doctorId ? { doctor_id: f.doctorId } : {}),
  ...(f.pacienteId || f.perfilPaciente
    ? {
        expedientes: {
          is: {
            ...(f.pacienteId ? { paciente_id: f.pacienteId } : {}),
            ...(f.perfilPaciente ? { pacientes: { is: { perfil_id: f.perfilPaciente } } } : {}),
          },
        },
      }
    : {}),
  ...(f.desde || f.hastaExclusivo
    ? { fecha: { ...(f.desde ? { gte: f.desde } : {}), ...(f.hastaExclusivo ? { lt: f.hastaExclusivo } : {}) } }
    : {}),
});

const signos = (valor: Record<string, unknown> | undefined) =>
  valor === undefined ? undefined : (valor as Prisma.InputJsonValue);

export class ConsultasRepository {
  /** Paciente (con su estado) y el id de su expediente. */
  async findPacienteConExpediente(pacienteId: string) {
    return prisma.pacientes.findUnique({
      where: { id: pacienteId },
      select: { id: true, activo: true, perfil_id: true, expedientes: { select: { id: true } } },
    });
  }

  async findCita(citaId: string) {
    return prisma.citas.findUnique({
      where: { id: citaId },
      select: { id: true, paciente_id: true, doctor_id: true, estado: true, consultas: { select: { id: true } } },
    });
  }

  /** Crea la consulta y, si atiende una cita, la marca `atendida` (todo o nada). */
  async crear(
    expedienteId: string,
    doctorId: string,
    citaId: string | undefined,
    datos: DatosConsulta,
  ): Promise<ConsultaConRelaciones> {
    return prisma.$transaction(async (tx) => {
      const consulta = await tx.consultas.create({
        data: {
          expediente_id: expedienteId,
          doctor_id: doctorId,
          cita_id: citaId ?? null,
          motivo_consulta: datos.motivo_consulta,
          signos_vitales: signos(datos.signos_vitales),
          examen_fisico: datos.examen_fisico,
          notas: datos.notas,
        },
        include: consultaInclude,
      });
      if (citaId) await tx.citas.update({ where: { id: citaId }, data: { estado: 'atendida' } });
      return consulta;
    });
  }

  async listar(filtro: FiltroConsultas, skip: number, take: number): Promise<[ConsultaConRelaciones[], number]> {
    const where = construirWhere(filtro);
    return prisma.$transaction([
      prisma.consultas.findMany({ where, include: consultaInclude, orderBy: { fecha: 'desc' }, skip, take }),
      prisma.consultas.count({ where }),
    ]);
  }

  async findBase(id: string): Promise<ConsultaBase | null> {
    const c = await prisma.consultas.findUnique({
      where: { id },
      select: {
        id: true,
        doctor_id: true,
        cerrada_en: true,
        expedientes: { select: { paciente_id: true, pacientes: { select: { perfil_id: true } } } },
      },
    });
    if (!c) return null;
    return {
      id: c.id,
      doctor_id: c.doctor_id,
      cerrada_en: c.cerrada_en,
      paciente_id: c.expedientes.paciente_id,
      paciente_perfil_id: c.expedientes.pacientes.perfil_id,
    };
  }

  async findDetalle(id: string): Promise<ConsultaDetalle | null> {
    return prisma.consultas.findUnique({ where: { id }, include: consultaDetalleInclude });
  }

  async actualizar(id: string, datos: DatosConsulta): Promise<ConsultaConRelaciones> {
    return prisma.consultas.update({
      where: { id },
      data: { ...datos, signos_vitales: signos(datos.signos_vitales) },
      include: consultaInclude,
    });
  }

  async cerrar(id: string): Promise<ConsultaConRelaciones> {
    return prisma.consultas.update({ where: { id }, data: { cerrada_en: new Date() }, include: consultaInclude });
  }

  async crearDiagnostico(consultaId: string, autorId: string, datos: DatosDiagnostico): Promise<DiagnosticoConAutor> {
    return prisma.diagnosticos.create({
      data: { consulta_id: consultaId, registrado_por: autorId, ...datos },
      include: diagnosticoInclude,
    });
  }

  /** La receta no toca el inventario: `item_id` es solo una referencia (HUNI-97). */
  async crearReceta(consultaId: string, autorId: string, datos: DatosReceta): Promise<RecetaConDetalles> {
    return prisma.recetas.create({
      data: {
        consulta_id: consultaId,
        registrado_por: autorId,
        indicaciones: datos.indicaciones,
        receta_detalles: { create: datos.detalles },
      },
      include: recetaInclude,
    });
  }

  /** Cuántos de estos ids existen en el inventario. */
  async contarItems(ids: string[]): Promise<number> {
    return prisma.inventario_items.count({ where: { id: { in: ids } } });
  }

  /** Consultas de un paciente, de la más reciente a la más antigua. */
  async historial(pacienteId: string): Promise<ConsultaDetalle[]> {
    return prisma.consultas.findMany({
      where: { expedientes: { is: { paciente_id: pacienteId } } },
      include: consultaDetalleInclude,
      orderBy: { fecha: 'desc' },
    });
  }

  async findExpediente(pacienteId: string): Promise<Expediente | null> {
    return prisma.expedientes.findUnique({ where: { paciente_id: pacienteId } });
  }

  async actualizarExpediente(pacienteId: string, cambios: Partial<Expediente>): Promise<Expediente> {
    return prisma.expedientes.update({
      where: { paciente_id: pacienteId },
      data: { ...cambios, updated_at: new Date() },
    });
  }
}
