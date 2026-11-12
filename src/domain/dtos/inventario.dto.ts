import { z } from '../../lib/zod';
import { fecha, fechaHora, PersonaResumenSchema, uuidOut } from './common.dto';
import { AlertaCaducidadSchema, CategoriaInventarioSchema, TipoMovimientoSchema } from './enums';

export const ItemInventarioSchema = z
  .object({
    id: uuidOut,
    codigo: z.string().openapi({ example: 'MED-0001' }),
    nombre: z.string().openapi({ example: 'Paracetamol 500 mg' }),
    categoria: CategoriaInventarioSchema,
    tipo_control: z
      .enum(['lote', 'numero_serie'])
      .openapi({ description: 'Sale de la categoría: `lote` (medicamento, insumo) o `numero_serie` (equipo).' }),
    unidad_medida: z.string().openapi({ example: 'tableta' }),
    stock_actual: z.number().int().openapi({
      description: 'Lo calcula la BD: suma de los lotes, o equipos que no están dados de baja. No se envía.',
      example: 420,
    }),
    stock_minimo: z.number().int().openapi({ example: 200 }),
    bajo_minimo: z.boolean().openapi({ description: '`stock_actual < stock_minimo`' }),
    ubicacion: z.string().nullable().openapi({ example: 'Farmacia' }),
    activo: z.boolean(),
  })
  .openapi('ItemInventario');

export const LoteSchema = z
  .object({
    id: uuidOut,
    numero_lote: z.string().openapi({ description: 'Se guarda en mayúsculas', example: 'PCT-2401' }),
    fecha_caducidad: fecha,
    cantidad_actual: z.number().int().openapi({ example: 120 }),
    dias_restantes: z.number().int().openapi({ description: 'Negativo si ya venció', example: 10 }),
    vencido: z.boolean(),
    alerta: AlertaCaducidadSchema.nullable().openapi({ description: '`null` si vence en más de 30 días' }),
  })
  .openapi('Lote');

const ItemResumenSchema = z
  .object({
    id: uuidOut,
    codigo: z.string().openapi({ example: 'MED-0001' }),
    nombre: z.string().openapi({ example: 'Paracetamol 500 mg' }),
    stock_actual: z.number().int().openapi({ description: 'Stock del ítem después del movimiento', example: 300 }),
  })
  .openapi('ItemInventarioResumen');

export const MovimientoSchema = z
  .object({
    id: uuidOut,
    tipo: TipoMovimientoSchema,
    cantidad: z.number().int().openapi({ description: 'Unidades; en un ajuste lleva signo', example: 20 }),
    motivo: z.string().nullable().openapi({ example: 'Entrega a Emergencia' }),
    item: ItemResumenSchema,
    lote: z
      .object({
        id: uuidOut,
        numero_lote: z.string().openapi({ example: 'PCT-2401' }),
        fecha_caducidad: fecha,
        cantidad_actual: z.number().int().openapi({ example: 100 }),
      })
      .nullable()
      .openapi({ description: 'Los movimientos anteriores a HUNI-97 pueden no tener lote' }),
    proveedor: z.object({ id: uuidOut, nombre: z.string() }).nullable().openapi({ description: 'Solo en entradas' }),
    registrado_por: PersonaResumenSchema.openapi({ description: 'Cuenta de la sesión que lo registró' }),
    created_at: fechaHora,
  })
  .openapi('MovimientoInventario');

export const LotePorVencerSchema = z
  .object({
    lote_id: uuidOut,
    numero_lote: z.string().openapi({ example: 'PCT-2401' }),
    fecha_caducidad: fecha,
    cantidad_actual: z.number().int().openapi({ example: 120 }),
    dias_restantes: z.number().int().openapi({ example: 10 }),
    alerta: AlertaCaducidadSchema,
    item: z.object({
      id: uuidOut,
      codigo: z.string().openapi({ example: 'MED-0001' }),
      nombre: z.string().openapi({ example: 'Paracetamol 500 mg' }),
      categoria: CategoriaInventarioSchema,
    }),
  })
  .openapi('LotePorVencer');

export const LotesPorVencerSchema = z
  .object({
    resumen: z.object({
      vencidos: z.number().int().openapi({ example: 1 }),
      en_15_dias: z.number().int().openapi({ example: 2 }),
      en_30_dias: z.number().int().openapi({ example: 1 }),
    }),
    items: z.array(LotePorVencerSchema).openapi({ description: 'Primero el que vence antes' }),
  })
  .openapi('LotesPorVencer', { description: 'Lotes con existencias vencidos o que vencen en 30 días o menos.' });
