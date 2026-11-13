import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';

type Categoria = 'medicamento' | 'insumo' | 'equipo';
type TipoMovimiento = 'entrada' | 'salida' | 'ajuste';

const movimientoInclude = {
  inventario_items: { select: { id: true, codigo: true, nombre: true, stock_actual: true } },
  lotes_inventario: { select: { id: true, numero_lote: true, fecha_caducidad: true, cantidad_actual: true } },
  proveedores: { select: { id: true, nombre: true } },
  perfiles: { select: { id: true, nombres: true, apellidos: true } },
} as const;

export type Item = Prisma.inventario_itemsGetPayload<object>;
export type Lote = Prisma.lotes_inventarioGetPayload<object>;
export type MovimientoCompleto = Prisma.movimientos_inventarioGetPayload<{ include: typeof movimientoInclude }>;

export interface FiltroItems {
  buscar?: string;
  categoria?: Categoria;
  ubicacion?: string;
  bajo_minimo?: boolean;
  activo?: boolean;
}

export interface DatosItem {
  codigo?: string;
  nombre?: string;
  categoria?: Categoria;
  unidad_medida?: string;
  stock_minimo?: number;
  ubicacion?: string | null;
  activo?: boolean;
}

export interface DatosEntrada {
  numero_lote: string;
  fecha_caducidad: Date;
  cantidad: number;
  proveedor_id: string;
  motivo: string | null;
}

export interface DatosMovimiento {
  lote_id: string;
  tipo: Exclude<TipoMovimiento, 'entrada'>;
  cantidad: number;
  motivo: string;
}

export interface FiltroMovimientos {
  item_id?: string;
  lote_id?: string;
  tipo?: TipoMovimiento;
  proveedor_id?: string;
  desde?: Date;
  hastaExclusivo?: Date;
}

/** Fila de la vista `v_lotes_por_vencer` (migración de HUNI-97). */
export interface FilaLotePorVencer {
  lote_id: string;
  item_id: string;
  item_codigo: string;
  item_nombre: string;
  categoria: Categoria;
  numero_lote: string;
  fecha_caducidad: Date;
  cantidad_actual: number;
  dias_restantes: number;
  alerta: 'vencido' | '15_dias' | '30_dias';
}

const whereItems = (f: FiltroItems): Prisma.inventario_itemsWhereInput => ({
  ...(f.activo === undefined ? {} : { activo: f.activo }),
  ...(f.categoria ? { categoria: f.categoria } : {}),
  ...(f.ubicacion ? { ubicacion: { contains: f.ubicacion, mode: 'insensitive' } } : {}),
  ...(f.bajo_minimo === undefined
    ? {}
    : {
        stock_actual: f.bajo_minimo
          ? { lt: prisma.inventario_items.fields.stock_minimo }
          : { gte: prisma.inventario_items.fields.stock_minimo },
      }),
  ...(f.buscar
    ? {
        OR: [
          { codigo: { contains: f.buscar, mode: 'insensitive' } },
          { nombre: { contains: f.buscar, mode: 'insensitive' } },
        ],
      }
    : {}),
});

const whereMovimientos = (f: FiltroMovimientos): Prisma.movimientos_inventarioWhereInput => ({
  ...(f.item_id ? { item_id: f.item_id } : {}),
  ...(f.lote_id ? { lote_id: f.lote_id } : {}),
  ...(f.tipo ? { tipo: f.tipo } : {}),
  ...(f.proveedor_id ? { proveedor_id: f.proveedor_id } : {}),
  ...(f.desde || f.hastaExclusivo
    ? {
        created_at: {
          ...(f.desde ? { gte: f.desde } : {}),
          ...(f.hastaExclusivo ? { lt: f.hastaExclusivo } : {}),
        },
      }
    : {}),
});

export class InventarioRepository {
  async listar(filtro: FiltroItems, skip: number, take: number): Promise<[Item[], number]> {
    const where = whereItems(filtro);
    return prisma.$transaction([
      prisma.inventario_items.findMany({ where, orderBy: { codigo: 'asc' }, skip, take }),
      prisma.inventario_items.count({ where }),
    ]);
  }

  async findById(id: string): Promise<Item | null> {
    return prisma.inventario_items.findUnique({ where: { id } });
  }

  async crear(datos: DatosItem & Pick<Item, 'codigo' | 'nombre' | 'categoria' | 'unidad_medida'>): Promise<Item> {
    return prisma.inventario_items.create({ data: datos });
  }

  // stock_actual nunca se escribe desde aquí: lo mantienen los triggers de lotes, movimientos y activos.
  async actualizar(id: string, datos: DatosItem): Promise<Item> {
    return prisma.inventario_items.update({ where: { id }, data: datos });
  }

  /** Orden FEFO: primero el que vence antes. */
  async listarLotes(itemId: string, conExistencias: boolean): Promise<Lote[]> {
    return prisma.lotes_inventario.findMany({
      where: { item_id: itemId, ...(conExistencias ? { cantidad_actual: { gt: 0 } } : {}) },
      orderBy: [{ fecha_caducidad: 'asc' }, { numero_lote: 'asc' }],
    });
  }

  /** `registrar_entrada_lote`: crea el lote si no existe y registra la entrada en una sola transacción. */
  async registrarEntrada(itemId: string, d: DatosEntrada, registradoPor: string): Promise<MovimientoCompleto> {
    const [fila] = await prisma.$queryRaw<{ id: string }[]>`
      select public.registrar_entrada_lote(
        ${itemId}::uuid,
        ${d.numero_lote}::text,
        ${d.fecha_caducidad}::date,
        ${d.cantidad}::integer,
        ${d.proveedor_id}::uuid,
        ${registradoPor}::uuid,
        ${d.motivo}::text
      )::text as id`;
    return this.findMovimiento(fila.id) as Promise<MovimientoCompleto>;
  }

  /** Salida o ajuste. La BD valida el lote, la caducidad y que no quede en negativo (aunque haya concurrencia). */
  async registrarMovimiento(itemId: string, d: DatosMovimiento, registradoPor: string): Promise<MovimientoCompleto> {
    return prisma.movimientos_inventario.create({
      data: {
        item_id: itemId,
        lote_id: d.lote_id,
        tipo: d.tipo,
        cantidad: d.cantidad,
        motivo: d.motivo,
        registrado_por: registradoPor,
      },
      include: movimientoInclude,
    });
  }

  async findMovimiento(id: string): Promise<MovimientoCompleto | null> {
    return prisma.movimientos_inventario.findUnique({ where: { id }, include: movimientoInclude });
  }

  async listarMovimientos(
    filtro: FiltroMovimientos,
    skip: number,
    take: number,
  ): Promise<[MovimientoCompleto[], number]> {
    const where = whereMovimientos(filtro);
    return prisma.$transaction([
      prisma.movimientos_inventario.findMany({
        where,
        include: movimientoInclude,
        orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
        skip,
        take,
      }),
      prisma.movimientos_inventario.count({ where }),
    ]);
  }

  // La vista no es un modelo de Prisma: se lee con SQL.
  async lotesPorVencer(filtro: { alerta?: string; categoria?: Categoria }): Promise<FilaLotePorVencer[]> {
    return prisma.$queryRaw<FilaLotePorVencer[]>`
      select lote_id::text, item_id::text, item_codigo, item_nombre, categoria::text as categoria, numero_lote,
             fecha_caducidad, cantidad_actual, dias_restantes, alerta
      from public.v_lotes_por_vencer
      where (${filtro.alerta ?? null}::text is null or alerta = ${filtro.alerta ?? null}::text)
        and (${filtro.categoria ?? null}::text is null or categoria::text = ${filtro.categoria ?? null}::text)
      order by fecha_caducidad, numero_lote`;
  }
}
