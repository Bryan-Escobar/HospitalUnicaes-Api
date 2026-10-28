import {
  AmbulanciaSchema,
  BitacoraAmbulanciaSchema,
  SeguimientoSolicitudPublicaSchema,
  SolicitudAmbulanciaSchema,
} from '../../domain/dtos/ambulancia.dto';
import { ROLES } from '../../domain/dtos/enums';
import {
  actualizarSolicitudBodySchema,
  actualizarSolicitudPublicaBodySchema,
  bitacoraQuerySchema,
  cambiarEstadoAmbulanciaBodySchema,
  cancelarSolicitudBodySchema,
  cerrarSolicitudBodySchema,
  codigoSeguimientoParamSchema,
  crearSolicitudBodySchema,
  crearSolicitudPublicaBodySchema,
  listarSolicitudesQuerySchema,
} from '../../domain/validators/ambulancia.validator';
import { idParamSchema } from '../../domain/validators/common.validator';
import { jsonBody, paginado, registerEndpoint } from '../registry';

const TAG = 'Ambulancia';
const TICKET = 'HUNI-70';
const REALTIME = 'Cada cambio se emite por Supabase Realtime (tablas `ambulancias` y `solicitudes_ambulancia`).';

registerEndpoint({
  method: 'get',
  path: '/api/ambulancia',
  tag: TAG,
  summary: 'Estado de la ambulancia',
  description:
    'La única ambulancia y su servicio en curso. Un `paciente` solo ve el servicio en curso si es suyo. ' +
    `Para verla en vivo, suscríbete por Realtime en lugar de consultar en bucle. ${REALTIME}`,
  roles: [...ROLES],
  ticket: TICKET,
  estado: 'implementado',
  response: { description: 'Ambulancia', schema: AmbulanciaSchema },
});

registerEndpoint({
  method: 'patch',
  path: '/api/ambulancia/estado',
  tag: TAG,
  summary: 'Poner o quitar de mantenimiento',
  description:
    'Solo `disponible ⇄ en_mantenimiento`. Desde `en_servicio` → 422 `AMBULANCIA_EN_SERVICIO` (primero se cierra ' +
    `el servicio). El cambio queda en la bitácora con la descripción. ${REALTIME}`,
  roles: ['administrador'],
  ticket: TICKET,
  estado: 'implementado',
  request: { body: jsonBody(cambiarEstadoAmbulanciaBodySchema) },
  response: { description: 'Ambulancia actualizada', schema: AmbulanciaSchema },
  errores: { 422: ['AMBULANCIA_EN_SERVICIO', 'TRANSICION_INVALIDA'] },
});

registerEndpoint({
  method: 'post',
  path: '/api/ambulancia/solicitudes',
  tag: TAG,
  summary: 'Solicitar ambulancia',
  description:
    'Queda `pendiente` hasta que recepción la despache. Basta la dirección o las coordenadas del GPS. ' +
    'Un `paciente` siempre la pide a su nombre y solo puede tener una abierta (429 `LIMITE_SOLICITUDES`). ' +
    `Sin sesión se usa \`POST /api/publico/ambulancia/solicitudes\`. ${REALTIME}`,
  roles: ['paciente', 'recepcionista', 'doctor'],
  ticket: TICKET,
  estado: 'implementado',
  request: { body: jsonBody(crearSolicitudBodySchema) },
  response: { status: 201, description: 'Solicitud creada', schema: SolicitudAmbulanciaSchema },
  errores: { 400: ['REFERENCIA_INVALIDA'], 403: ['PERFIL_INCOMPLETO'], 429: ['LIMITE_SOLICITUDES'] },
});

registerEndpoint({
  method: 'get',
  path: '/api/ambulancia/solicitudes',
  tag: TAG,
  summary: 'Listar solicitudes',
  description:
    'De la más reciente a la más antigua, con filtros por fecha, estado, prioridad, tipo de emergencia y canal. ' +
    'Recepción las sigue en vivo por Realtime. Un `paciente` solo ve las suyas.',
  roles: [...ROLES],
  ticket: TICKET,
  estado: 'implementado',
  request: { query: listarSolicitudesQuerySchema },
  response: { description: 'Página de solicitudes', schema: paginado(SolicitudAmbulanciaSchema) },
});

registerEndpoint({
  method: 'get',
  path: '/api/ambulancia/solicitudes/{id}',
  tag: TAG,
  summary: 'Detalle de una solicitud',
  description: 'Un `paciente` solo puede ver las suyas (seguimiento desde iOS, HUNI-73).',
  roles: [...ROLES],
  ticket: TICKET,
  estado: 'implementado',
  request: { params: idParamSchema },
  response: { description: 'Solicitud', schema: SolicitudAmbulanciaSchema },
});

registerEndpoint({
  method: 'patch',
  path: '/api/ambulancia/solicitudes/{id}',
  tag: TAG,
  summary: 'Completar los datos de una solicitud',
  description:
    'Recepción agrega lo que no llegó con la solicitud (paciente, tipo de emergencia, prioridad, destino, ' +
    `contacto...) mientras siga abierta. Finalizada o cancelada → 409 \`SOLICITUD_CERRADA\`. ${REALTIME}`,
  roles: ['recepcionista', 'administrador'],
  ticket: TICKET,
  estado: 'implementado',
  request: { params: idParamSchema, body: jsonBody(actualizarSolicitudBodySchema) },
  response: { description: 'Solicitud actualizada', schema: SolicitudAmbulanciaSchema },
  errores: { 400: ['REFERENCIA_INVALIDA'], 409: ['SOLICITUD_CERRADA'] },
});

registerEndpoint({
  method: 'post',
  path: '/api/ambulancia/solicitudes/{id}/despachar',
  tag: TAG,
  summary: 'Despachar (ambulancia → en_servicio)',
  description:
    'Solo si la ambulancia está `disponible` y la solicitud `pendiente`. Con dos despachos simultáneos solo uno ' +
    `tiene éxito; el otro recibe 409 \`AMBULANCIA_NO_DISPONIBLE\` (también en mantenimiento). ${REALTIME}`,
  roles: ['recepcionista'],
  ticket: TICKET,
  estado: 'implementado',
  request: { params: idParamSchema },
  response: { description: 'Ambulancia despachada', schema: SolicitudAmbulanciaSchema },
  errores: { 409: ['AMBULANCIA_NO_DISPONIBLE'], 422: ['TRANSICION_INVALIDA'] },
});

registerEndpoint({
  method: 'post',
  path: '/api/ambulancia/solicitudes/{id}/en-curso',
  tag: TAG,
  summary: 'Marcar en curso (el paciente ya va en la ambulancia)',
  description: `Solo una solicitud \`despachada\`. La ambulancia sigue \`en_servicio\`. ${REALTIME}`,
  roles: ['recepcionista'],
  ticket: TICKET,
  estado: 'implementado',
  request: { params: idParamSchema },
  response: { description: 'Servicio en curso', schema: SolicitudAmbulanciaSchema },
  errores: { 422: ['TRANSICION_INVALIDA'] },
});

registerEndpoint({
  method: 'post',
  path: '/api/ambulancia/solicitudes/{id}/cerrar',
  tag: TAG,
  summary: 'Cerrar servicio (ambulancia → disponible)',
  description:
    'Finaliza una solicitud `despachada` o `en_curso`; la ambulancia vuelve a `disponible` y la emergencia queda en ' +
    `la bitácora con la descripción. ${REALTIME}`,
  roles: ['recepcionista'],
  ticket: TICKET,
  estado: 'implementado',
  request: { params: idParamSchema, body: jsonBody(cerrarSolicitudBodySchema) },
  response: { description: 'Servicio cerrado', schema: SolicitudAmbulanciaSchema },
  errores: { 422: ['TRANSICION_INVALIDA'] },
});

registerEndpoint({
  method: 'post',
  path: '/api/ambulancia/solicitudes/{id}/cancelar',
  tag: TAG,
  summary: 'Cancelar solicitud',
  description:
    'Una `pendiente`: recepción, administración o el propio `paciente`. Una `despachada` o `en_curso` (falsa ' +
    'alarma): solo recepción o administración y con `motivo`; la ambulancia vuelve a `disponible` y queda en la ' +
    `bitácora. ${REALTIME}`,
  roles: ['recepcionista', 'administrador', 'paciente'],
  ticket: TICKET,
  estado: 'implementado',
  request: { params: idParamSchema, body: jsonBody(cancelarSolicitudBodySchema) },
  response: { description: 'Solicitud cancelada', schema: SolicitudAmbulanciaSchema },
  errores: { 422: ['TRANSICION_INVALIDA'] },
});

registerEndpoint({
  method: 'get',
  path: '/api/ambulancia/bitacora',
  tag: TAG,
  summary: 'Bitácora de la ambulancia',
  description:
    'Cada cambio de estado (despacho, cierre, cancelación, mantenimiento) con quién lo hizo y la emergencia ' +
    'atendida (paciente, ubicación, motivo y horas). Filtros por fecha, estado nuevo, prioridad y tipo de emergencia.',
  roles: ['administrador', 'recepcionista', 'doctor'],
  ticket: TICKET,
  estado: 'implementado',
  request: { query: bitacoraQuerySchema },
  response: { description: 'Página de la bitácora', schema: paginado(BitacoraAmbulanciaSchema) },
});

// ---------- Botón público del login (sin sesión) ----------

const PUBLICO = 'Público';

registerEndpoint({
  method: 'post',
  path: '/api/publico/ambulancia/solicitudes',
  tag: PUBLICO,
  summary: 'Solicitar ambulancia sin cuenta',
  description:
    'Botón "Solicitar ambulancia" del login: basta la ubicación (coordenadas del GPS o, sin permiso, la dirección). ' +
    'Queda `pendiente` con canal `publico`: recepción la verifica y decide el despacho. Devuelve el ' +
    '`codigo_seguimiento`: guárdalo en el dispositivo para ver el estado, agregar datos o cancelar. ' +
    'Límite: 3 por IP cada 15 minutos y 5 públicas pendientes a la vez (429 `LIMITE_SOLICITUDES`).',
  roles: 'publico',
  ticket: TICKET,
  estado: 'implementado',
  request: { body: jsonBody(crearSolicitudPublicaBodySchema) },
  response: { status: 201, description: 'Solicitud recibida', schema: SeguimientoSolicitudPublicaSchema },
  errores: { 429: ['LIMITE_SOLICITUDES'] },
});

registerEndpoint({
  method: 'get',
  path: '/api/publico/ambulancia/solicitudes/{codigo}',
  tag: PUBLICO,
  summary: 'Seguimiento de una solicitud pública',
  description:
    'Solo el estado y las horas, sin datos de nadie. Sin sesión no hay Realtime: consulta cada ~10 s mientras ' +
    'la pantalla de espera esté abierta.',
  roles: 'publico',
  ticket: TICKET,
  estado: 'implementado',
  request: { params: codigoSeguimientoParamSchema },
  response: { description: 'Seguimiento', schema: SeguimientoSolicitudPublicaSchema },
});

registerEndpoint({
  method: 'patch',
  path: '/api/publico/ambulancia/solicitudes/{codigo}',
  tag: PUBLICO,
  summary: 'Agregar datos a una solicitud pública',
  description:
    'Formulario opcional de la pantalla de espera: teléfono (para que recepción devuelva la llamada), nombre, ' +
    'qué pasó o una referencia de la dirección. Finalizada o cancelada → 409 `SOLICITUD_CERRADA`.',
  roles: 'publico',
  ticket: TICKET,
  estado: 'implementado',
  request: { params: codigoSeguimientoParamSchema, body: jsonBody(actualizarSolicitudPublicaBodySchema) },
  response: { description: 'Datos agregados', schema: SeguimientoSolicitudPublicaSchema },
  errores: { 409: ['SOLICITUD_CERRADA'] },
});

registerEndpoint({
  method: 'post',
  path: '/api/publico/ambulancia/solicitudes/{codigo}/cancelar',
  tag: PUBLICO,
  summary: 'Cancelar una solicitud pública ("Ya no la necesito")',
  description:
    'Mientras no esté finalizada ni cancelada, aunque la ambulancia ya vaya en camino (vuelve a `disponible`).',
  roles: 'publico',
  ticket: TICKET,
  estado: 'implementado',
  request: { params: codigoSeguimientoParamSchema, body: jsonBody(cancelarSolicitudBodySchema) },
  response: { description: 'Solicitud cancelada', schema: SeguimientoSolicitudPublicaSchema },
  errores: { 422: ['TRANSICION_INVALIDA'] },
});
