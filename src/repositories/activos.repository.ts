import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';

type EstadoActivo = 'disponible' | 'en_uso' | 'en_mantenimiento' | 'dado_de_baja';

const activoInclude = {
  inventario_items: { select: { id: true, codigo: true, nombre: true } },
  proveedores: { select: { id: true, nombre: true } },
  perfiles: { select: { id: true, nombres: true, apellidos: true } },
} as const;

export type ActivoCompleto = Prisma.activosGetPayload<{ include: typeof activoInclude }>;

export interface FiltroActivos {
  item_id?: string;
  proveedor_id?: string;
  estado?: EstadoActivo;
  buscar?: string;
}

export interface DatosNuevoActivo {
  item_id: string;
  numero_serie: string;
  proveedor_id: string;
  estado: Exclude<EstadoActivo, 'dado_de_baja'>;
  ubicacion?: string | null;
  fecha_ingreso?: Date;
  notas?: string | null;
}

export interface CambiosActivo {
  estado?: EstadoActivo;
  ubicacion?: string | null;
  notas?: string | null;
}

export class ActivosRepository {
  async listar(filtro: FiltroActivos, skip: number, take: number): Promise<[ActivoCompleto[], number]> {
    const where: Prisma.activosWhereInput = {
      ...(filtro.item_id ? { item_id: filtro.item_id } : {}),
      ...(filtro.proveedor_id ? { proveedor_id: filtro.proveedor_id } : {}),
      ...(filtro.estado ? { estado: filtro.estado } : {}),
      ...(filtro.buscar
        ? {
            OR: [
              { numero_serie: { contains: filtro.buscar, mode: 'insensitive' } },
              { ubicacion: { contains: filtro.buscar, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return prisma.$transaction([
      prisma.activos.findMany({ where, include: activoInclude, orderBy: [{ numero_serie: 'asc' }], skip, take }),
      prisma.activos.count({ where }),
    ]);
  }

  async findById(id: string): Promise<ActivoCompleto | null> {
    return prisma.activos.findUnique({ where: { id }, include: activoInclude });
  }

  // La BD valida que el ítem sea un equipo activo, que el proveedor esté activo y mantiene el stock del ítem.
  async crear(datos: DatosNuevoActivo, registradoPor: string): Promise<ActivoCompleto> {
    return prisma.activos.create({ data: { ...datos, registrado_por: registradoPor }, include: activoInclude });
  }

  async actualizar(id: string, cambios: CambiosActivo): Promise<ActivoCompleto> {
    return prisma.activos.update({ where: { id }, data: cambios, include: activoInclude });
  }
}
