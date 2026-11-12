import {
  ItemInventarioSchema,
  LoteSchema,
  LotesPorVencerSchema,
  MovimientoSchema,
} from '../../domain/dtos/inventario.dto';
import { idParamSchema } from '../../domain/validators/common.validator';
import {
  actualizarItemBodySchema,
  ajusteBodySchema,
  crearItemBodySchema,
  entradaBodySchema,
  listarItemsQuerySchema,
  listarLotesQuerySchema,
  listarMovimientosQuerySchema,
  lotesPorVencerQuerySchema,
  salidaBodySchema,
} from '../../domain/validators/inventario.validator';
import { z } from '../../lib/zod';
import { jsonBody, paginado, registerEndpoint } from '../registry';

const TAG = 'Inventario';
const TICKET = 'HUNI-98';
const LEEN = ['administrador', 'doctor', 'recepcionista'] as const;
const REGISTRADO = 'El movimiento queda a nombre de la cuenta de la sesión (`registrado_por`).';

registerEndpoint({
  method: 'get',
  path: '/api/inventario',
  tag: TAG,
  summary: 'Listar ítems (existencias)',
  description:
    'Búsqueda por código o nombre, filtros por categoría, ubicación y stock bajo el mínimo. Orden por código. ' +
    'Doctor y recepción solo ven ítems activos.',
  roles: [...LEEN],
  ticket: TICKET,
  estado: 'implementado',
  request: { query: listarItemsQuerySchema },
  response: { description: 'Página de ítems', schema: paginado(ItemInventarioSchema) },
});

registerEndpoint({
  method: 'post',
  path: '/api/inventario',
  tag: TAG,
  summary: 'Crear un ítem',
  description: 'Nace con stock 0: el stock entra con lotes (medicamento, insumo) o activos (equipo).',
  roles: ['administrador'],
  ticket: TICKET,
  estado: 'implementado',
  request: { body: jsonBody(crearItemBodySchema) },
  response: { status: 201, description: 'Ítem creado', schema: ItemInventarioSchema },
  errores: { 409: ['REGISTRO_DUPLICADO'] },
});

registerEndpoint({
  method: 'get',
  path: '/api/inventario/{id}',
  tag: TAG,
  summary: 'Detalle de un ítem',
  description: 'Un ítem desactivado responde 404 para doctor y recepción.',
  roles: [...LEEN],
  ticket: TICKET,
  estado: 'implementado',
  request: { params: idParamSchema },
  response: { description: 'Ítem', schema: ItemInventarioSchema },
});

registerEndpoint({
  method: 'patch',
  path: '/api/inventario/{id}',
  tag: TAG,
  summary: 'Editar un ítem',
  description:
    'Solo los campos que cambian. `activo: false` lo desactiva (con stock 0) y `activo: true` lo reactiva. ' +
    'Con lotes o activos, la `categoria` ya no cambia.',
  roles: ['administrador'],
  ticket: TICKET,
  estado: 'implementado',
  request: { params: idParamSchema, body: jsonBody(actualizarItemBodySchema) },
  response: { description: 'Ítem actualizado', schema: ItemInventarioSchema },
  errores: { 409: ['REGISTRO_DUPLICADO'], 422: ['ITEM_CON_EXISTENCIAS', 'TIPO_CONTROL_INVALIDO'] },
});

registerEndpoint({
  method: 'delete',
  path: '/api/inventario/{id}',
  tag: TAG,
  summary: 'Desactivar un ítem',
  description:
    'Desactivación lógica: conserva lotes, activos e historial. Solo con stock 0: antes descarta sus lotes con un ' +
    'ajuste o da de baja sus equipos. Desactivado no admite movimientos ni activos nuevos (`ITEM_INACTIVO`).',
  roles: ['administrador'],
  ticket: TICKET,
  estado: 'implementado',
  request: { params: idParamSchema },
  response: { description: 'Ítem desactivado', schema: ItemInventarioSchema },
  errores: { 422: ['ITEM_CON_EXISTENCIAS'] },
});

registerEndpoint({
  method: 'get',
  path: '/api/inventario/{id}/lotes',
  tag: TAG,
  summary: 'Lotes del ítem (FEFO)',
  description:
    'Primero el que vence antes, para elegir el lote de una salida. Incluye los vencidos (`vencido: true`), que ' +
    'solo admiten un ajuste. Un equipo no tiene lotes → 422 `TIPO_CONTROL_INVALIDO` (usa `/api/activos`).',
  roles: [...LEEN],
  ticket: TICKET,
  estado: 'implementado',
  request: { params: idParamSchema, query: listarLotesQuerySchema },
  response: { description: 'Lotes en orden FEFO', schema: z.array(LoteSchema) },
  errores: { 422: ['TIPO_CONTROL_INVALIDO'] },
});

registerEndpoint({
  method: 'post',
  path: '/api/inventario/{id}/entradas',
  tag: TAG,
  summary: 'Entrada de un lote',
  description:
    'Usa `registrar_entrada_lote`: crea el lote si no existe (mismo número y caducidad → se suma) y registra la ' +
    `entrada con su proveedor activo. ${REGISTRADO}`,
  roles: ['administrador'],
  ticket: TICKET,
  estado: 'implementado',
  request: { params: idParamSchema, body: jsonBody(entradaBodySchema) },
  response: { status: 201, description: 'Entrada registrada', schema: MovimientoSchema },
  errores: {
    409: ['LOTE_CADUCIDAD_DISTINTA'],
    422: ['LOTE_VENCIDO', 'PROVEEDOR_INVALIDO', 'TIPO_CONTROL_INVALIDO', 'ITEM_INACTIVO'],
  },
});

registerEndpoint({
  method: 'post',
  path: '/api/inventario/{id}/salidas',
  tag: TAG,
  summary: 'Salida por lote',
  description:
    'Descuenta unidades del lote elegido (nunca el lote completo). Un lote vencido no sale. Dos salidas ' +
    `simultáneas no pueden dejarlo en negativo (lo garantiza la BD). ${REGISTRADO}`,
  roles: ['administrador'],
  ticket: TICKET,
  estado: 'implementado',
  request: { params: idParamSchema, body: jsonBody(salidaBodySchema) },
  response: { status: 201, description: 'Salida registrada', schema: MovimientoSchema },
  errores: {
    400: ['REFERENCIA_INVALIDA'],
    409: ['STOCK_INSUFICIENTE'],
    422: ['LOTE_VENCIDO', 'TIPO_CONTROL_INVALIDO', 'ITEM_INACTIVO'],
  },
});

registerEndpoint({
  method: 'post',
  path: '/api/inventario/{id}/ajustes',
  tag: TAG,
  summary: 'Ajuste por lote',
  description:
    'Cantidad con signo (conteo físico, daños, descarte). Es el único movimiento que acepta un lote vencido. ' +
    REGISTRADO,
  roles: ['administrador'],
  ticket: TICKET,
  estado: 'implementado',
  request: { params: idParamSchema, body: jsonBody(ajusteBodySchema) },
  response: { status: 201, description: 'Ajuste registrado', schema: MovimientoSchema },
  errores: {
    400: ['REFERENCIA_INVALIDA'],
    409: ['STOCK_INSUFICIENTE'],
    422: ['TIPO_CONTROL_INVALIDO', 'ITEM_INACTIVO'],
  },
});

registerEndpoint({
  method: 'get',
  path: '/api/inventario/movimientos',
  tag: TAG,
  summary: 'Historial de movimientos',
  description:
    'Filtros por ítem, lote, tipo, proveedor y fechas (`desde`/`hasta` en hora de El Salvador, inclusive). Más recientes primero.',
  roles: ['administrador'],
  ticket: TICKET,
  estado: 'implementado',
  request: { query: listarMovimientosQuerySchema },
  response: { description: 'Página de movimientos', schema: paginado(MovimientoSchema) },
});

registerEndpoint({
  method: 'get',
  path: '/api/inventario/lotes-por-vencer',
  tag: TAG,
  summary: 'Alertas de caducidad',
  description:
    'Lotes con existencias de ítems activos que ya vencieron o vencen en 30 días o menos (`v_lotes_por_vencer`). ' +
    'El resumen cuenta todas las alertas; `alerta` solo filtra la lista.',
  roles: ['administrador'],
  ticket: TICKET,
  estado: 'implementado',
  request: { query: lotesPorVencerQuerySchema },
  response: { description: 'Lotes por vencer', schema: LotesPorVencerSchema },
});
