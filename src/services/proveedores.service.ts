import { ProveedorSchema } from '../domain/dtos/proveedores.dto';
import { CustomError } from '../domain/errors/CustomError';
import {
  ActualizarProveedorBody,
  CrearProveedorBody,
  ListarProveedoresQuery,
} from '../domain/validators/proveedores.validator';
import { paginacion, rangoDePagina } from '../lib/paginacion';
import { z } from '../lib/zod';
import { Proveedor, ProveedoresRepository } from '../repositories/proveedores.repository';

export type ProveedorDto = z.infer<typeof ProveedorSchema>;

/** Proveedores (HUNI-97, HUNI-98): solo el administrador. No se borran: se desactivan. */
export class ProveedoresService {
  constructor(private readonly proveedoresRepository = new ProveedoresRepository()) {}

  async listar(query: ListarProveedoresQuery) {
    const { pagina, por_pagina, ...filtro } = query;
    const { skip, take } = rangoDePagina(pagina, por_pagina);
    const [items, total] = await this.proveedoresRepository.listar(filtro, skip, take);
    return { items: items.map(toProveedor), paginacion: paginacion(pagina, por_pagina, total) };
  }

  async obtener(id: string): Promise<ProveedorDto> {
    return toProveedor(await this.buscarOFallar(id));
  }

  async crear(body: CrearProveedorBody): Promise<ProveedorDto> {
    return toProveedor(await this.proveedoresRepository.crear(body));
  }

  async actualizar(id: string, body: ActualizarProveedorBody): Promise<ProveedorDto> {
    await this.buscarOFallar(id);
    return toProveedor(await this.proveedoresRepository.actualizar(id, body));
  }

  /** Desactivado ya no se acepta en entradas ni activos nuevos; lo ya registrado conserva su proveedor. */
  async desactivar(id: string): Promise<ProveedorDto> {
    const proveedor = await this.buscarOFallar(id);
    if (!proveedor.activo) return toProveedor(proveedor);
    return toProveedor(await this.proveedoresRepository.actualizar(id, { activo: false }));
  }

  private async buscarOFallar(id: string): Promise<Proveedor> {
    const proveedor = await this.proveedoresRepository.findById(id);
    if (!proveedor) throw CustomError.notFound('El proveedor no existe');
    return proveedor;
  }
}

export const toProveedor = (p: Proveedor): ProveedorDto => ({
  id: p.id,
  nombre: p.nombre,
  nit: p.nit,
  nrc: p.nrc,
  contacto: p.contacto,
  telefono: p.telefono,
  email: p.email,
  direccion: p.direccion,
  activo: p.activo,
  created_at: p.created_at.toISOString(),
  updated_at: p.updated_at.toISOString(),
});
