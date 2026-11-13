import {
  ItemInventarioSchema,
  LoteSchema,
  LotesPorVencerSchema,
  MovimientoSchema,
} from '../domain/dtos/inventario.dto';
import { CustomError } from '../domain/errors/CustomError';
import { UsuarioAutenticado } from '../domain/interfaces';
import {
  ActualizarItemBody,
  AjusteBody,
  CrearItemBody,
  EntradaBody,
  ListarItemsQuery,
  ListarLotesQuery,
  ListarMovimientosQuery,
  LotesPorVencerQuery,
  SalidaBody,
} from '../domain/validators/inventario.validator';
import { aFechaDb, deFechaDb, hoyLocal, rangoDeFechas } from '../lib/fechas';
import { paginacion, rangoDePagina } from '../lib/paginacion';
import { z } from '../lib/zod';
import { InventarioRepository, Item, Lote, MovimientoCompleto } from '../repositories/inventario.repository';
import { toPersona } from './consultas.acceso';

export type ItemInventario = z.infer<typeof ItemInventarioSchema>;
export type LoteInventario = z.infer<typeof LoteSchema>;
export type Movimiento = z.infer<typeof MovimientoSchema>;
export type LotesPorVencer = z.infer<typeof LotesPorVencerSchema>;

/**
 * Inventario (HUNI-97, HUNI-98). Las reglas de lotes, caducidad y números de serie viven en la BD
 * (triggers y `registrar_entrada_lote`); sus errores llegan con su `code` (LOTE_VENCIDO, STOCK_INSUFICIENTE…).
 * - Leen existencias (ítems y lotes): administrador, doctor y recepción. Doctor y recepción solo ven ítems activos.
 * - Todo lo demás (crear, editar, desactivar, movimientos, historial y alertas): solo el administrador.
 * - `stock_actual` nunca se recibe: lo calcula la BD.
 */
export class InventarioService {
  constructor(private readonly inventarioRepository = new InventarioRepository()) {}

  async listar(query: ListarItemsQuery, usuario: UsuarioAutenticado) {
    const { pagina, por_pagina, activo, ...filtro } = query;
    if (usuario.rol !== 'administrador' && activo === false) {
      throw CustomError.forbidden('Solo la administración ve los ítems desactivados');
    }
    const { skip, take } = rangoDePagina(pagina, por_pagina);
    const [items, total] = await this.inventarioRepository.listar({ ...filtro, activo: activo ?? true }, skip, take);
    return { items: items.map(toItem), paginacion: paginacion(pagina, por_pagina, total) };
  }

  async obtener(id: string, usuario: UsuarioAutenticado): Promise<ItemInventario> {
    return toItem(await this.buscarVisible(id, usuario));
  }

  async crear(body: CrearItemBody): Promise<ItemInventario> {
    return toItem(await this.inventarioRepository.crear(body));
  }

  async actualizar(id: string, body: ActualizarItemBody): Promise<ItemInventario> {
    await this.buscarOFallar(id);
    return toItem(await this.inventarioRepository.actualizar(id, body));
  }

  /** Desactivación lógica. Con existencias la BD responde 422 ITEM_CON_EXISTENCIAS. */
  async desactivar(id: string): Promise<ItemInventario> {
    const item = await this.buscarOFallar(id);
    if (!item.activo) return toItem(item);
    return toItem(await this.inventarioRepository.actualizar(id, { activo: false }));
  }

  async listarLotes(id: string, query: ListarLotesQuery, usuario: UsuarioAutenticado): Promise<LoteInventario[]> {
    const item = await this.buscarVisible(id, usuario);
    if (item.categoria === 'equipo') {
      throw CustomError.fromCode(
        'TIPO_CONTROL_INVALIDO',
        'Los equipos se controlan por número de serie: consulta GET /api/activos?item_id=',
      );
    }
    const hoy = hoyLocal();
    const lotes = await this.inventarioRepository.listarLotes(id, query.con_existencias ?? true);
    return lotes.map((l) => toLote(l, hoy));
  }

  async registrarEntrada(id: string, body: EntradaBody, usuario: UsuarioAutenticado): Promise<Movimiento> {
    await this.buscarOFallar(id);
    const movimiento = await this.inventarioRepository.registrarEntrada(
      id,
      {
        numero_lote: body.numero_lote,
        fecha_caducidad: aFechaDb(body.fecha_caducidad),
        cantidad: body.cantidad,
        proveedor_id: body.proveedor_id,
        motivo: body.motivo ?? null,
      },
      usuario.id,
    );
    return toMovimiento(movimiento);
  }

  async registrarSalida(id: string, body: SalidaBody, usuario: UsuarioAutenticado): Promise<Movimiento> {
    await this.buscarOFallar(id);
    return toMovimiento(
      await this.inventarioRepository.registrarMovimiento(id, { ...body, tipo: 'salida' }, usuario.id),
    );
  }

  async registrarAjuste(id: string, body: AjusteBody, usuario: UsuarioAutenticado): Promise<Movimiento> {
    await this.buscarOFallar(id);
    return toMovimiento(
      await this.inventarioRepository.registrarMovimiento(id, { ...body, tipo: 'ajuste' }, usuario.id),
    );
  }

  async listarMovimientos(query: ListarMovimientosQuery) {
    const { pagina, por_pagina, desde, hasta, ...filtro } = query;
    const { skip, take } = rangoDePagina(pagina, por_pagina);
    const [items, total] = await this.inventarioRepository.listarMovimientos(
      { ...filtro, ...rangoDeFechas(desde, hasta) },
      skip,
      take,
    );
    return { items: items.map(toMovimiento), paginacion: paginacion(pagina, por_pagina, total) };
  }

  /** El resumen cuenta todas las alertas (de la categoría pedida); `alerta` solo filtra la lista. */
  async lotesPorVencer(query: LotesPorVencerQuery): Promise<LotesPorVencer> {
    const filas = await this.inventarioRepository.lotesPorVencer({ categoria: query.categoria });
    const cuenta = (alerta: string) => filas.filter((f) => f.alerta === alerta).length;
    return {
      resumen: { vencidos: cuenta('vencido'), en_15_dias: cuenta('15_dias'), en_30_dias: cuenta('30_dias') },
      items: filas
        .filter((f) => !query.alerta || f.alerta === query.alerta)
        .map((f) => ({
          lote_id: f.lote_id,
          numero_lote: f.numero_lote,
          fecha_caducidad: deFechaDb(f.fecha_caducidad),
          cantidad_actual: Number(f.cantidad_actual),
          dias_restantes: Number(f.dias_restantes),
          alerta: f.alerta,
          item: { id: f.item_id, codigo: f.item_codigo, nombre: f.item_nombre, categoria: f.categoria },
        })),
    };
  }

  private async buscarOFallar(id: string): Promise<Item> {
    const item = await this.inventarioRepository.findById(id);
    if (!item) throw CustomError.notFound('El ítem de inventario no existe');
    return item;
  }

  // Doctor y recepción no ven ítems desactivados: para ellos es como si no existieran.
  private async buscarVisible(id: string, usuario: UsuarioAutenticado): Promise<Item> {
    const item = await this.buscarOFallar(id);
    if (!item.activo && usuario.rol !== 'administrador') throw CustomError.notFound('El ítem de inventario no existe');
    return item;
  }
}

const DIA_MS = 24 * 60 * 60 * 1000;

export const toItem = (i: Item): ItemInventario => ({
  id: i.id,
  codigo: i.codigo,
  nombre: i.nombre,
  categoria: i.categoria,
  tipo_control: i.categoria === 'equipo' ? 'numero_serie' : 'lote',
  unidad_medida: i.unidad_medida,
  stock_actual: i.stock_actual,
  stock_minimo: i.stock_minimo,
  bajo_minimo: i.stock_actual < i.stock_minimo,
  ubicacion: i.ubicacion,
  activo: i.activo,
});

export const toLote = (l: Lote, hoy: string): LoteInventario => {
  const dias = Math.round((l.fecha_caducidad.getTime() - aFechaDb(hoy).getTime()) / DIA_MS);
  return {
    id: l.id,
    numero_lote: l.numero_lote,
    fecha_caducidad: deFechaDb(l.fecha_caducidad),
    cantidad_actual: l.cantidad_actual,
    dias_restantes: dias,
    vencido: dias < 0,
    alerta: dias < 0 ? 'vencido' : dias <= 15 ? '15_dias' : dias <= 30 ? '30_dias' : null,
  };
};

export const toMovimiento = (m: MovimientoCompleto): Movimiento => ({
  id: m.id,
  tipo: m.tipo,
  cantidad: m.cantidad,
  motivo: m.motivo,
  item: m.inventario_items,
  lote: m.lotes_inventario
    ? {
        id: m.lotes_inventario.id,
        numero_lote: m.lotes_inventario.numero_lote,
        fecha_caducidad: deFechaDb(m.lotes_inventario.fecha_caducidad),
        cantidad_actual: m.lotes_inventario.cantidad_actual,
      }
    : null,
  proveedor: m.proveedores,
  registrado_por: toPersona(m.perfiles),
  created_at: m.created_at.toISOString(),
});
