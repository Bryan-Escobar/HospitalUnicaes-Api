import { ActivoSchema } from '../domain/dtos/activos.dto';
import { CustomError } from '../domain/errors/CustomError';
import { UsuarioAutenticado } from '../domain/interfaces';
import { ActualizarActivoBody, CrearActivoBody, ListarActivosQuery } from '../domain/validators/activos.validator';
import { aFechaDb, deFechaDb } from '../lib/fechas';
import { paginacion, rangoDePagina } from '../lib/paginacion';
import { z } from '../lib/zod';
import { ActivoCompleto, ActivosRepository } from '../repositories/activos.repository';
import { toPersona } from './consultas.acceso';

export type Activo = z.infer<typeof ActivoSchema>;

/**
 * Activos: equipos por número de serie (HUNI-97, HUNI-98). Solo el administrador.
 * La BD exige que el ítem sea un equipo activo (TIPO_CONTROL_INVALIDO, ITEM_INACTIVO) con proveedor activo
 * (PROVEEDOR_INVALIDO), mantiene el stock del ítem y no deja modificar uno dado de baja (ACTIVO_DADO_DE_BAJA).
 */
export class ActivosService {
  constructor(private readonly activosRepository = new ActivosRepository()) {}

  async listar(query: ListarActivosQuery) {
    const { pagina, por_pagina, ...filtro } = query;
    const { skip, take } = rangoDePagina(pagina, por_pagina);
    const [items, total] = await this.activosRepository.listar(filtro, skip, take);
    return { items: items.map(toActivo), paginacion: paginacion(pagina, por_pagina, total) };
  }

  async obtener(id: string): Promise<Activo> {
    return toActivo(await this.buscarOFallar(id));
  }

  async crear(body: CrearActivoBody, usuario: UsuarioAutenticado): Promise<Activo> {
    const activo = await this.activosRepository.crear(
      { ...body, fecha_ingreso: body.fecha_ingreso ? aFechaDb(body.fecha_ingreso) : undefined },
      usuario.id,
    );
    return toActivo(activo);
  }

  async actualizar(id: string, body: ActualizarActivoBody): Promise<Activo> {
    await this.buscarOFallar(id);
    return toActivo(await this.activosRepository.actualizar(id, body));
  }

  private async buscarOFallar(id: string): Promise<ActivoCompleto> {
    const activo = await this.activosRepository.findById(id);
    if (!activo) throw CustomError.notFound('El activo no existe');
    return activo;
  }
}

export const toActivo = (a: ActivoCompleto): Activo => ({
  id: a.id,
  numero_serie: a.numero_serie,
  estado: a.estado,
  ubicacion: a.ubicacion,
  fecha_ingreso: deFechaDb(a.fecha_ingreso),
  notas: a.notas,
  item: a.inventario_items,
  proveedor: a.proveedores,
  registrado_por: toPersona(a.perfiles),
  created_at: a.created_at.toISOString(),
  updated_at: a.updated_at.toISOString(),
});
