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
const REALTIME =
  'Cada cambio de estado se emite por Supabase Realtime (`postgres_changes` en `orden_examenes` y ' +
  '`ordenes_laboratorio`); el RLS hace que cada cliente reciba solo las órdenes que puede ver. ' +
  'El aviso trae el estado, no el valor del resultado: el cliente vuelve a pedir la orden a esta API.';
const ROLES_LAB =
  'Procesan los exámenes administración y recepción (Recepcionista/Asistente) hasta que exista un rol de ' +
  'laboratorio (HUNI-75); `validado_por` guarda quién registró el resultado.';
const TRANSICIONES = 'Solo `pendiente → en_proceso → completado`; cualquier otra → 422 `TRANSICION_INVALIDA`.';

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
  description:
    'De la más reciente a la más antigua. Administración y recepción ven todas; un `doctor`, las de los pacientes ' +
    'que atiende; un `paciente`, solo las propias.',
  roles: ['administrador', 'doctor', 'recepcionista', 'paciente'],
  ticket: 'HUNI-62',
  estado: 'implementado',
  request: { query: listarOrdenesQuerySchema },
  response: { description: 'Página de órdenes', schema: paginado(OrdenLaboratorioSchema) },
  errores: { 403: ['PERFIL_INCOMPLETO'] },
});

registerEndpoint({
  method: 'get',
  path: '/api/laboratorio/ordenes/{id}',
  tag: TAG,
  summary: 'Detalle de una orden',
  description:
    'Acceso: médico tratante, el propio paciente, recepción (procesa los exámenes) y administración. ' +
    'Cualquier otro → 403 `ACCESO_DENEGADO`.',
  roles: ['administrador', 'doctor', 'recepcionista', 'paciente'],
  ticket: 'HUNI-62',
  estado: 'implementado',
  request: { params: idParamSchema },
  response: { description: 'Orden', schema: OrdenLaboratorioSchema },
  errores: { 403: ['PERFIL_INCOMPLETO'] },
});

registerEndpoint({
  method: 'patch',
  path: '/api/laboratorio/ordenes/{id}/examenes/{orden_examen_id}/estado',
  tag: TAG,
  summary: 'Iniciar examen (pendiente → en_proceso)',
  description: `${TRANSICIONES} Guarda \`fecha_inicio\`. ${REALTIME} ${ROLES_LAB}`,
  roles: ['administrador', 'recepcionista'],
  ticket: 'HUNI-62',
  estado: 'implementado',
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
    'Envía `multipart/form-data` con el valor y/o un PDF (campo `archivo`, máx. 10 MB); el PDF se guarda en el bucket ' +
    'privado `resultados-laboratorio` de Supabase Storage. El examen debe estar `en_proceso`. ' +
    `Sin valor ni archivo → 422 \`RESULTADO_REQUERIDO\`. Un resultado completado ya no se modifica. ${REALTIME} ${ROLES_LAB}`,
  roles: ['administrador', 'recepcionista'],
  ticket: 'HUNI-62',
  estado: 'implementado',
  request: {
    params: ordenExamenParamsSchema,
    body: { required: true, content: { 'multipart/form-data': { schema: registrarResultadoBodySchema } } },
  },
  response: { description: 'Examen completado', schema: OrdenExamenSchema },
  errores: {
    400: ['SOLICITUD_INVALIDA'],
    403: ['PERFIL_INCOMPLETO'],
    422: ['TRANSICION_INVALIDA', 'RESULTADO_REQUERIDO'],
  },
});

registerEndpoint({
  method: 'get',
  path: '/api/laboratorio/ordenes/{id}/examenes/{orden_examen_id}/resultado/archivo',
  tag: TAG,
  summary: 'URL firmada del PDF de resultado',
  description:
    'Devuelve una URL firmada de Supabase Storage que vence a los 10 minutos. Acceso: médico tratante, el propio ' +
    'paciente y administración (recepción no descarga resultados). Sin PDF → 404.',
  roles: ['administrador', 'doctor', 'paciente'],
  ticket: 'HUNI-62',
  estado: 'implementado',
  request: { params: ordenExamenParamsSchema },
  response: { description: 'URL de descarga', schema: ArchivoFirmadoSchema },
  errores: { 403: ['PERFIL_INCOMPLETO'] },
});
