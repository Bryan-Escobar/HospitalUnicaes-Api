import { ActivoSchema } from '../../domain/dtos/activos.dto';
import {
  actualizarActivoBodySchema,
  crearActivoBodySchema,
  listarActivosQuerySchema,
} from '../../domain/validators/activos.validator';
import { idParamSchema } from '../../domain/validators/common.validator';
import { jsonBody, paginado, registerEndpoint } from '../registry';

const TAG = 'Activos';
const TICKET = 'HUNI-98';

registerEndpoint({
  method: 'get',
  path: '/api/activos',
  tag: TAG,
  summary: 'Listar activos (equipos)',
  description: 'Filtros por ítem, proveedor, estado y búsqueda por número de serie o ubicación.',
  roles: ['administrador'],
  ticket: TICKET,
  estado: 'implementado',
  request: { query: listarActivosQuerySchema },
  response: { description: 'Página de activos', schema: paginado(ActivoSchema) },
});

registerEndpoint({
  method: 'post',
  path: '/api/activos',
  tag: TAG,
  summary: 'Registrar un equipo',
  description:
    'El ítem debe ser de categoría `equipo` y estar activo; el proveedor, activo. Suma 1 al stock del ítem. ' +
    'Queda a nombre de la cuenta de la sesión (`registrado_por`).',
  roles: ['administrador'],
  ticket: TICKET,
  estado: 'implementado',
  request: { body: jsonBody(crearActivoBodySchema) },
  response: { status: 201, description: 'Activo registrado', schema: ActivoSchema },
  errores: {
    400: ['REFERENCIA_INVALIDA'],
    409: ['REGISTRO_DUPLICADO'],
    422: ['TIPO_CONTROL_INVALIDO', 'PROVEEDOR_INVALIDO', 'ITEM_INACTIVO'],
  },
});

registerEndpoint({
  method: 'get',
  path: '/api/activos/{id}',
  tag: TAG,
  summary: 'Detalle de un activo',
  roles: ['administrador'],
  ticket: TICKET,
  estado: 'implementado',
  request: { params: idParamSchema },
  response: { description: 'Activo', schema: ActivoSchema },
});

registerEndpoint({
  method: 'patch',
  path: '/api/activos/{id}',
  tag: TAG,
  summary: 'Cambiar estado, ubicación o notas',
  description:
    'Pasar a `dado_de_baja` resta 1 al stock del ítem y es definitivo: después cualquier cambio → 409 ' +
    '`ACTIVO_DADO_DE_BAJA`.',
  roles: ['administrador'],
  ticket: TICKET,
  estado: 'implementado',
  request: { params: idParamSchema, body: jsonBody(actualizarActivoBodySchema) },
  response: { description: 'Activo actualizado', schema: ActivoSchema },
  errores: { 409: ['ACTIVO_DADO_DE_BAJA'] },
});
