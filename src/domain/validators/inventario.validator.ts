import { AlertaCaducidadSchema, CategoriaInventarioSchema, TipoMovimientoSchema } from '../dtos/enums';
import { z } from '../../lib/zod';
import { booleanQuery, paginacionQuerySchema, rangoFechasQuerySchema } from './common.validator';

const ESTRICTO =
  'Esquema estricto: un campo extra (p. ej. `stock_actual`, que calcula la BD) responde 400 `Campo no permitido`.';

const texto = (max: number) => z.string().trim().min(1).max(max);
const cantidad = z.number().int().min(1).max(1_000_000);
const motivo = texto(500).openapi({ example: 'Entrega a Emergencia' });

const datosItem = z.object({
  codigo: texto(30).openapi({ description: 'Único', example: 'MED-0003' }),
  nombre: texto(150).openapi({ example: 'Ibuprofeno 400 mg' }),
  categoria: CategoriaInventarioSchema,
  unidad_medida: texto(30).openapi({ example: 'tableta' }),
  stock_minimo: z.number().int().min(0).max(1_000_000).openapi({ example: 100 }),
  ubicacion: texto(100).nullable().openapi({ example: 'Farmacia' }),
});

export const crearItemBodySchema = datosItem
  .extend({ stock_minimo: datosItem.shape.stock_minimo.default(0), ubicacion: datosItem.shape.ubicacion.optional() })
  .strict()
  .openapi('CrearItemInventarioBody', { description: ESTRICTO });

export const actualizarItemBodySchema = datosItem
  .extend({
    activo: z.boolean().openapi({
      description: '`false` lo desactiva (solo con stock 0, si no 422 `ITEM_CON_EXISTENCIAS`); `true` lo reactiva.',
    }),
  })
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'Envía al menos un campo para actualizar' })
  .openapi('ActualizarItemInventarioBody', {
    description: `${ESTRICTO} Con lotes o activos registrados, \`categoria\` ya no cambia (422 \`TIPO_CONTROL_INVALIDO\`).`,
  });

export const listarItemsQuerySchema = paginacionQuerySchema
  .extend({
    buscar: z.string().trim().min(1).max(100).optional().openapi({ description: 'Código o nombre', example: 'para' }),
    categoria: CategoriaInventarioSchema.optional(),
    ubicacion: z.string().trim().min(1).max(100).optional().openapi({ description: 'Contiene', example: 'Farmacia' }),
    bajo_minimo: booleanQuery.optional().openapi({ description: '`true`: solo ítems con stock bajo el mínimo' }),
    activo: booleanQuery
      .optional()
      .openapi({ description: 'Solo administrador. Por defecto, solo los activos (doctor y recepción siempre).' }),
  })
  .openapi('ListarItemsInventarioQuery');

export const listarLotesQuerySchema = z
  .object({
    con_existencias: booleanQuery
      .optional()
      .openapi({ description: 'Por defecto `true`: solo lotes con unidades. `false` incluye los agotados.' }),
  })
  .openapi('ListarLotesQuery');

export const entradaBodySchema = z
  .object({
    numero_lote: texto(50).openapi({ description: 'Se guarda en mayúsculas', example: 'PCT-2501' }),
    fecha_caducidad: z.iso.date().openapi({ example: '2027-06-30' }),
    cantidad: cantidad.openapi({ example: 200 }),
    proveedor_id: z.uuid().openapi({ description: 'Proveedor activo' }),
    motivo: texto(500).optional().openapi({ example: 'Compra noviembre' }),
  })
  .strict()
  .openapi('EntradaLoteBody', {
    description:
      `${ESTRICTO} Si el lote ya existe con la misma caducidad se suma; con otra caducidad → 409 ` +
      '`LOTE_CADUCIDAD_DISTINTA`.',
  });

export const salidaBodySchema = z
  .object({
    lote_id: z.uuid().openapi({ description: 'Lote del ítem (el cliente los muestra en orden FEFO)' }),
    cantidad: cantidad.openapi({ example: 20 }),
    motivo,
  })
  .strict()
  .openapi('SalidaLoteBody', { description: ESTRICTO });

export const ajusteBodySchema = z
  .object({
    lote_id: z.uuid(),
    cantidad: z
      .number()
      .int()
      .min(-1_000_000)
      .max(1_000_000)
      .refine((n) => n !== 0, 'El ajuste no puede ser 0')
      .openapi({ description: 'Con signo: negativo descuenta (p. ej. descartar un lote vencido)', example: -5 }),
    motivo: motivo.openapi({ example: 'Conteo físico: 5 unidades dañadas' }),
  })
  .strict()
  .openapi('AjusteLoteBody', { description: `${ESTRICTO} Es el único movimiento que admite un lote vencido.` });

export const listarMovimientosQuerySchema = paginacionQuerySchema
  .extend({
    item_id: z.uuid().optional(),
    lote_id: z.uuid().optional(),
    tipo: TipoMovimientoSchema.optional(),
    proveedor_id: z.uuid().optional(),
  })
  .extend(rangoFechasQuerySchema.shape)
  .refine((q) => !q.desde || !q.hasta || q.desde <= q.hasta, {
    message: '`desde` no puede ser posterior a `hasta`',
    path: ['desde'],
  })
  .openapi('ListarMovimientosQuery');

export const lotesPorVencerQuerySchema = z
  .object({ alerta: AlertaCaducidadSchema.optional(), categoria: CategoriaInventarioSchema.optional() })
  .openapi('LotesPorVencerQuery');

export type CrearItemBody = z.infer<typeof crearItemBodySchema>;
export type ActualizarItemBody = z.infer<typeof actualizarItemBodySchema>;
export type ListarItemsQuery = z.infer<typeof listarItemsQuerySchema>;
export type ListarLotesQuery = z.infer<typeof listarLotesQuerySchema>;
export type EntradaBody = z.infer<typeof entradaBodySchema>;
export type SalidaBody = z.infer<typeof salidaBodySchema>;
export type AjusteBody = z.infer<typeof ajusteBodySchema>;
export type ListarMovimientosQuery = z.infer<typeof listarMovimientosQuerySchema>;
export type LotesPorVencerQuery = z.infer<typeof lotesPorVencerQuerySchema>;
