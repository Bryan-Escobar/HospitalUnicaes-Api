import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import { tratadoPor } from './pacientes.repository';

const persona = { select: { id: true, nombres: true, apellidos: true } } as const;

/** Orden para el detalle de una consulta: autor y el estado de cada examen (para derivar el de la orden). */
export const ordenResumenInclude = {
  personal: persona,
  orden_examenes: { select: { estado: true } },
} satisfies Prisma.ordenes_laboratorioInclude;

/** Orden completa: paciente, doctor, autor y exámenes con su resultado. */
const examenInclude = {
  examenes_catalogo: { select: { id: true, nombre: true, tipo_muestra: true } },
  resultados_laboratorio: { include: { personal: persona } },
} satisfies Prisma.orden_examenesInclude;

const ordenInclude = {
  personal: persona,
  consultas: {
    select: {
      expedientes: { select: { pacientes: persona } },
      personal: {
        select: { id: true, nombres: true, apellidos: true, especialidades: { select: { nombre: true } } },
      },
    },
  },
  orden_examenes: { include: examenInclude, orderBy: { examenes_catalogo: { nombre: 'asc' } } },
} satisfies Prisma.ordenes_laboratorioInclude;

export type OrdenResumen = Prisma.ordenes_laboratorioGetPayload<{ include: typeof ordenResumenInclude }>;
export type OrdenCompleta = Prisma.ordenes_laboratorioGetPayload<{ include: typeof ordenInclude }>;
export type ExamenCatalogo = Prisma.examenes_catalogoGetPayload<object>;
export type OrdenExamenCompleto = Prisma.orden_examenesGetPayload<{ include: typeof examenInclude }>;

export type EstadoLaboratorio = 'pendiente' | 'en_proceso' | 'completado';

export interface FiltroOrdenes {
  estado?: EstadoLaboratorio;
  prioridad?: 'normal' | 'urgente' | 'critica';
  pacienteId?: string;
  /** Solo pacientes que atiende este doctor (id de `personal`). */
  tratadosPor?: string;
  /** Solo las del paciente con esta cuenta (rol paciente). */
  perfilPaciente?: string;
  desde?: Date;
  hastaExclusivo?: Date;
}

/** Para decidir permisos: de quién es la orden. */
export interface AccesoOrden {
  id: string;
  paciente_id: string;
  paciente_perfil_id: string | null;
}

export interface DatosResultado {
  valor?: string;
  unidad?: string;
  rango_referencia?: string;
  observaciones?: string;
  archivo_url?: string;
}

const construirWhere = (f: FiltroOrdenes): Prisma.ordenes_laboratorioWhereInput => {
  const paciente: Prisma.pacientesWhereInput = {
    ...(f.pacienteId ? { id: f.pacienteId } : {}),
    ...(f.perfilPaciente ? { perfil_id: f.perfilPaciente } : {}),
    ...(f.tratadosPor ? tratadoPor(f.tratadosPor) : {}),
  };
  return {
    ...(f.estado ? { estado: f.estado } : {}),
    ...(f.prioridad ? { prioridad: f.prioridad } : {}),
    ...(f.desde || f.hastaExclusivo
      ? {
          fecha_solicitud: {
            ...(f.desde ? { gte: f.desde } : {}),
            ...(f.hastaExclusivo ? { lt: f.hastaExclusivo } : {}),
          },
        }
      : {}),
    ...(Object.keys(paciente).length > 0
      ? { consultas: { is: { expedientes: { is: { pacientes: { is: paciente } } } } } }
      : {}),
  };
};

export interface DatosOrden {
  prioridad: 'normal' | 'urgente' | 'critica';
  indicaciones?: string;
  examen_ids: string[];
}

export class LaboratorioRepository {
  async listarExamenesActivos(): Promise<ExamenCatalogo[]> {
    return prisma.examenes_catalogo.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } });
  }

  /** Ids (de los enviados) que existen en el catálogo y están activos. */
  async examenesActivos(ids: string[]): Promise<string[]> {
    const examenes = await prisma.examenes_catalogo.findMany({
      where: { id: { in: ids }, activo: true },
      select: { id: true },
    });
    return examenes.map((e) => e.id);
  }

  /** Orden `pendiente` con un examen `pendiente` por cada id del catálogo. */
  async crearOrden(consultaId: string, autorId: string, datos: DatosOrden): Promise<OrdenCompleta> {
    return prisma.ordenes_laboratorio.create({
      data: {
        consulta_id: consultaId,
        registrado_por: autorId,
        prioridad: datos.prioridad,
        indicaciones: datos.indicaciones,
        orden_examenes: { create: datos.examen_ids.map((examen_id) => ({ examen_id })) },
      },
      include: ordenInclude,
    });
  }

  /** Órdenes de la más reciente a la más antigua. */
  async listarOrdenes(filtro: FiltroOrdenes, skip: number, take: number): Promise<[OrdenCompleta[], number]> {
    const where = construirWhere(filtro);
    return prisma.$transaction([
      prisma.ordenes_laboratorio.findMany({
        where,
        include: ordenInclude,
        orderBy: { fecha_solicitud: 'desc' },
        skip,
        take,
      }),
      prisma.ordenes_laboratorio.count({ where }),
    ]);
  }

  async findOrden(id: string): Promise<OrdenCompleta | null> {
    return prisma.ordenes_laboratorio.findUnique({ where: { id }, include: ordenInclude });
  }

  async findAcceso(ordenId: string): Promise<AccesoOrden | null> {
    const o = await prisma.ordenes_laboratorio.findUnique({
      where: { id: ordenId },
      select: {
        id: true,
        consultas: { select: { expedientes: { select: { pacientes: { select: { id: true, perfil_id: true } } } } } },
      },
    });
    if (!o) return null;
    const p = o.consultas.expedientes.pacientes;
    return { id: o.id, paciente_id: p.id, paciente_perfil_id: p.perfil_id };
  }

  /** Examen de una orden (null si no existe o es de otra orden). */
  async findExamen(ordenId: string, ordenExamenId: string): Promise<OrdenExamenCompleto | null> {
    return prisma.orden_examenes.findFirst({ where: { id: ordenExamenId, orden_id: ordenId }, include: examenInclude });
  }

  /** pendiente → en_proceso (la BD valida la transición y guarda fecha_inicio). */
  async iniciarExamen(ordenExamenId: string): Promise<OrdenExamenCompleto> {
    return prisma.orden_examenes.update({
      where: { id: ordenExamenId },
      data: { estado: 'en_proceso', fecha_inicio: new Date() },
      include: examenInclude,
    });
  }

  /** Guarda el resultado y completa el examen en una sola transacción (en_proceso → completado). */
  async registrarResultado(
    ordenExamenId: string,
    validadoPor: string,
    datos: DatosResultado,
  ): Promise<OrdenExamenCompleto> {
    return prisma.$transaction(async (tx) => {
      await tx.resultados_laboratorio.create({
        data: { orden_examen_id: ordenExamenId, validado_por: validadoPor, ...datos },
      });
      return tx.orden_examenes.update({
        where: { id: ordenExamenId },
        data: { estado: 'completado', fecha_completado: new Date() },
        include: examenInclude,
      });
    });
  }
}
