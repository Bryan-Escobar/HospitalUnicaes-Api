import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';

const persona = { select: { id: true, nombres: true, apellidos: true } } as const;

/** Orden para el detalle de una consulta: autor y el estado de cada examen (para derivar el de la orden). */
export const ordenResumenInclude = {
  personal: persona,
  orden_examenes: { select: { estado: true } },
} satisfies Prisma.ordenes_laboratorioInclude;

/** Orden completa: paciente, doctor, autor y exámenes con su resultado. */
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
  orden_examenes: {
    include: {
      examenes_catalogo: { select: { id: true, nombre: true, tipo_muestra: true } },
      resultados_laboratorio: { include: { personal: persona } },
    },
    orderBy: { examenes_catalogo: { nombre: 'asc' } },
  },
} satisfies Prisma.ordenes_laboratorioInclude;

export type OrdenResumen = Prisma.ordenes_laboratorioGetPayload<{ include: typeof ordenResumenInclude }>;
export type OrdenCompleta = Prisma.ordenes_laboratorioGetPayload<{ include: typeof ordenInclude }>;
export type ExamenCatalogo = Prisma.examenes_catalogoGetPayload<object>;

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
}
