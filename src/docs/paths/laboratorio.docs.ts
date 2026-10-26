import {
  ArchivoFirmadoSchema,
  ExamenCatalogoSchema,
  OrdenExamenSchema,
  OrdenLaboratorioSchema,
} from '../../domain/dtos/laboratorio.dto';
import { idParamSchema } from '../../domain/validators/common.validator';
import {
  cambiarEstadoExamenBodySchema,
  crearOrdenBodySchema,
  listarOrdenesQuerySchema,
  ordenExamenParamsSchema,
  registrarResultadoBodySchema,
} from '../../domain/validators/laboratorio.validator';
import { z } from '../../lib/zod';
import { jsonBody, paginado, registerEndpoint } from '../registry';

const TAG = 'Laboratorio';
const REALTIME = 'Cada cambio de estado se emite por Supabase Realtime (tabla `orden_examenes`).';
const ROLES_LAB = 'Quién procesa los exámenes está **por definir** en la matriz RBAC (HUNI-75).';

registerEndpoint({
  method: 'get',
  path: '/api/laboratorio/examenes',
  tag: TAG,
  summary: 'Catálogo de exámenes',
  roles: ['administrador', 'doctor', 'recepcionista'],
  ticket: 'HUNI-57',
  estado: 'implementado',
  response: { description: 'Exámenes activos', schema: z.array(ExamenCatalogoSchema) },
});

registerEndpoint({
  method: 'post',
  path: '/api/laboratorio/ordenes',
  tag: TAG,
  summary: 'Solicitar exámenes',
  description:
    'Crea la orden en estado `pendiente` con un examen por cada id del catálogo (los repetidos se ignoran). ' +
    'Solo el doctor que registró la consulta y mientras esté abierta; queda como `registrado_por`.',
  roles: ['doctor'],
  ticket: 'HUNI-57',
  estado: 'implementado',
  request: { body: jsonBody(crearOrdenBodySchema) },
  response: { status: 201, description: 'Orden creada', schema: OrdenLaboratorioSchema },
  errores: { 400: ['REFERENCIA_INVALIDA'], 403: ['PERFIL_INCOMPLETO'], 409: ['CONSULTA_CERRADA'] },
});

registerEndpoint({
  method: 'get',
  path: '/api/laboratorio/ordenes',
  tag: TAG,
  summary: 'Listar órdenes',
  description: 'Un `doctor` ve las de sus pacientes; un `paciente`, solo las propias.',
  roles: ['administrador', 'doctor', 'recepcionista', 'paciente'],
  ticket: 'HUNI-62',
  request: { query: listarOrdenesQuerySchema },
  response: { description: 'Página de órdenes', schema: paginado(OrdenLaboratorioSchema) },
});

registerEndpoint({
  method: 'get',
  path: '/api/laboratorio/ordenes/{id}',
  tag: TAG,
  summary: 'Detalle de una orden',
  description: 'Acceso: médico tratante, el propio paciente, recepción y administración.',
  roles: ['administrador', 'doctor', 'recepcionista', 'paciente'],
  ticket: 'HUNI-62',
  request: { params: idParamSchema },
  response: { description: 'Orden', schema: OrdenLaboratorioSchema },
});

registerEndpoint({
  method: 'patch',
  path: '/api/laboratorio/ordenes/{id}/examenes/{orden_examen_id}/estado',
  tag: TAG,
  summary: 'Iniciar examen (pendiente → en_proceso)',
  description: `Cualquier otra transición → 422 \`TRANSICION_INVALIDA\`. ${REALTIME} ${ROLES_LAB}`,
  roles: ['administrador', 'recepcionista'],
  ticket: 'HUNI-62',
  request: { params: ordenExamenParamsSchema, body: jsonBody(cambiarEstadoExamenBodySchema) },
  response: { description: 'Examen en proceso', schema: OrdenExamenSchema },
  errores: { 422: ['TRANSICION_INVALIDA'] },
});

registerEndpoint({
  method: 'put',
  path: '/api/laboratorio/ordenes/{id}/examenes/{orden_examen_id}/resultado',
  tag: TAG,
  summary: 'Registrar resultado (en_proceso → completado)',
  description:
    'Envía `multipart/form-data` con el valor y/o un PDF; el PDF se guarda en Supabase Storage. ' +
    `Sin valor ni archivo → 422 \`RESULTADO_REQUERIDO\`. ${REALTIME} ${ROLES_LAB}`,
  roles: ['administrador', 'recepcionista'],
  ticket: 'HUNI-62',
  request: {
    params: ordenExamenParamsSchema,
    body: { required: true, content: { 'multipart/form-data': { schema: registrarResultadoBodySchema } } },
  },
  response: { description: 'Examen completado', schema: OrdenExamenSchema },
  errores: { 422: ['TRANSICION_INVALIDA', 'RESULTADO_REQUERIDO'] },
});

registerEndpoint({
  method: 'get',
  path: '/api/laboratorio/ordenes/{id}/examenes/{orden_examen_id}/resultado/archivo',
  tag: TAG,
  summary: 'URL firmada del PDF de resultado',
  description:
    'Devuelve una URL temporal para descargar el PDF. Acceso: médico tratante, el propio paciente y administración.',
  roles: ['administrador', 'doctor', 'paciente'],
  ticket: 'HUNI-62',
  request: { params: ordenExamenParamsSchema },
  response: { description: 'URL de descarga', schema: ArchivoFirmadoSchema },
});
