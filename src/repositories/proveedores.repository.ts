import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';

export type Proveedor = Prisma.proveedoresGetPayload<object>;

export interface DatosProveedor {
  nombre?: string;
  nit?: string | null;
  nrc?: string | null;
  contacto?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  activo?: boolean;
}

export class ProveedoresRepository {
  async listar(
    filtro: { buscar?: string; activo?: boolean },
    skip: number,
    take: number,
  ): Promise<[Proveedor[], number]> {
    const where: Prisma.proveedoresWhereInput = {
      ...(filtro.activo === undefined ? {} : { activo: filtro.activo }),
      ...(filtro.buscar
        ? {
            OR: [
              { nombre: { contains: filtro.buscar, mode: 'insensitive' } },
              { nit: { contains: filtro.buscar } },
              { nrc: { contains: filtro.buscar } },
            ],
          }
        : {}),
    };
    return prisma.$transaction([
      prisma.proveedores.findMany({ where, orderBy: { nombre: 'asc' }, skip, take }),
      prisma.proveedores.count({ where }),
    ]);
  }

  async findById(id: string): Promise<Proveedor | null> {
    return prisma.proveedores.findUnique({ where: { id } });
  }

  async crear(datos: DatosProveedor & { nombre: string }): Promise<Proveedor> {
    return prisma.proveedores.create({ data: datos });
  }

  async actualizar(id: string, datos: DatosProveedor): Promise<Proveedor> {
    return prisma.proveedores.update({ where: { id }, data: datos });
  }
}
