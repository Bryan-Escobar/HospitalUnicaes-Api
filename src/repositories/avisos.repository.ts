import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';

const conAutor = { perfiles: { select: { id: true, nombres: true, apellidos: true } } } as const;

export type AvisoConAutor = Prisma.avisosGetPayload<{ include: typeof conAutor }>;

export type FiltroVigencia = 'vigentes' | 'programados' | 'vencidos' | 'todos';

export interface FiltroAvisos {
  vigencia: FiltroVigencia;
  es_publico?: boolean;
  ahora: Date;
}

export interface DatosAviso {
  titulo?: string;
  contenido?: string;
  es_publico?: boolean;
  fecha_publicacion?: Date;
  fecha_expiracion?: Date | null;
}

const porVigencia = (vigencia: FiltroVigencia, ahora: Date): Prisma.avisosWhereInput => {
  switch (vigencia) {
    case 'vigentes':
      return {
        fecha_publicacion: { lte: ahora },
        OR: [{ fecha_expiracion: null }, { fecha_expiracion: { gt: ahora } }],
      };
    case 'programados':
      return { fecha_publicacion: { gt: ahora } };
    case 'vencidos':
      return { fecha_expiracion: { lte: ahora } };
    default:
      return {};
  }
};

export class AvisosRepository {
  async listar(filtro: FiltroAvisos, skip: number, take: number): Promise<[AvisoConAutor[], number]> {
    const where: Prisma.avisosWhereInput = {
      ...porVigencia(filtro.vigencia, filtro.ahora),
      ...(filtro.es_publico === undefined ? {} : { es_publico: filtro.es_publico }),
    };
    return prisma.$transaction([
      prisma.avisos.findMany({ where, include: conAutor, orderBy: { fecha_publicacion: 'desc' }, skip, take }),
      prisma.avisos.count({ where }),
    ]);
  }

  async findById(id: string): Promise<AvisoConAutor | null> {
    return prisma.avisos.findUnique({ where: { id }, include: conAutor });
  }

  async crear(autorId: string, datos: DatosAviso & { titulo: string; contenido: string }): Promise<AvisoConAutor> {
    return prisma.avisos.create({ data: { ...datos, autor_id: autorId }, include: conAutor });
  }

  async actualizar(id: string, datos: DatosAviso): Promise<AvisoConAutor> {
    return prisma.avisos.update({ where: { id }, data: datos, include: conAutor });
  }

  async eliminar(id: string): Promise<void> {
    await prisma.avisos.delete({ where: { id } });
  }
}
