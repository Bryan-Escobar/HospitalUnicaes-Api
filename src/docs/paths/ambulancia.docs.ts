import {
  AmbulanciaSchema,
  BitacoraAmbulanciaSchema,
  SolicitudAmbulanciaSchema,
} from '../../domain/dtos/ambulancia.dto';
import { ROLES } from '../../domain/dtos/enums';
import {
  bitacoraQuerySchema,
  cambiarEstadoAmbulanciaBodySchema,
  cancelarSolicitudBodySchema,
  cerrarSolicitudBodySchema,
  crearSolicitudBodySchema,
  listarSolicitudesQuerySchema,
} from '../../domain/validators/ambulancia.validator';
import { idParamSchema } from '../../domain/validators/common.validator';
import { jsonBody, paginado, registerEndpoint } from '../registry';

const TAG = 'Ambulancia';
const REALTIME = 'Cada cambio se emite por Supabase Realtime (tablas `ambulancias` y `solicitudes_ambulancia`).';

registerEndpoint({
  method: 'get',
  path: '/api/ambulancia',
  tag: TAG,
  summary: 'Estado de la ambulancia',
  description: `La única ambulancia y su servicio en curso. Para verla en vivo, suscríbete por Realtime en lugar de consultar en bucle. ${REALTIME}`,
  roles: [...ROLES],
  ticket: 'HUNI-70',
  response: { description: 'Ambulancia', schema: AmbulanciaSchema },
});

registerEndpoint({
  method: 'patch',
  path: '/api/ambulancia/estado',
  tag: TAG,
  summary: 'Poner o quitar de mantenimiento',
  description: `Solo \`disponible ⇄ en_mantenimiento\`. Desde \`en_servicio\` → 422 \`AMBULANCIA_EN_SERVICIO\`. ${REALTIME}`,
  roles: ['administrador'],
  ticket: 'HUNI-70',
  request: { body: jsonBody(cambiarEstadoAmbulanciaBodySchema) },
  response: { description: 'Ambulancia actualizada', schema: AmbulanciaSchema },
  errores: { 422: ['AMBULANCIA_EN_SERVICIO', 'TRANSICION_INVALIDA'] },
});

registerEndpoint({
  method: 'post',
  path: '/api/ambulancia/solicitudes',
  tag: TAG,
  summary: 'Solicitar ambulancia',
  description: `Queda en estado \`pendiente\` hasta que recepción la despache. ${REALTIME}`,
  roles: ['paciente', 'recepcionista', 'doctor'],
  ticket: 'HUNI-70',
  request: { body: jsonBody(crearSolicitudBodySchema) },
  response: { status: 201, description: 'Solicitud creada', schema: SolicitudAmbulanciaSchema },
  errores: { 400: ['REFERENCIA_INVALIDA'] },
});

registerEndpoint({
  method: 'get',
  path: '/api/ambulancia/solicitudes',
  tag: TAG,
  summary: 'Listar solicitudes',
  description: 'Un `paciente` solo ve las suyas.',
  roles: [...ROLES],
  ticket: 'HUNI-70',
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
  ticket: 'HUNI-70',
  request: { params: idParamSchema },
  response: { description: 'Solicitud', schema: SolicitudAmbulanciaSchema },
});

registerEndpoint({
  method: 'post',
  path: '/api/ambulancia/solicitudes/{id}/despachar',
  tag: TAG,
  summary: 'Despachar (ambulancia → en_servicio)',
  description:
    'Solo si la ambulancia está `disponible` y la solicitud `pendiente`. Con dos despachos simultáneos solo uno ' +
    `tiene éxito; el otro recibe 409 \`AMBULANCIA_NO_DISPONIBLE\`. ${REALTIME}`,
  roles: ['recepcionista'],
  ticket: 'HUNI-70',
  request: { params: idParamSchema },
  response: { description: 'Ambulancia despachada', schema: SolicitudAmbulanciaSchema },
  errores: { 409: ['AMBULANCIA_NO_DISPONIBLE'], 422: ['TRANSICION_INVALIDA'] },
});

registerEndpoint({
  method: 'post',
  path: '/api/ambulancia/solicitudes/{id}/cerrar',
  tag: TAG,
  summary: 'Cerrar servicio (ambulancia → disponible)',
  description: `Finaliza la solicitud y registra la emergencia en la bitácora. ${REALTIME}`,
  roles: ['recepcionista'],
  ticket: 'HUNI-70',
  request: { params: idParamSchema, body: jsonBody(cerrarSolicitudBodySchema) },
  response: { description: 'Servicio cerrado', schema: SolicitudAmbulanciaSchema },
  errores: { 422: ['TRANSICION_INVALIDA'] },
});

registerEndpoint({
  method: 'post',
  path: '/api/ambulancia/solicitudes/{id}/cancelar',
  tag: TAG,
  summary: 'Cancelar solicitud',
  description: 'Solo solicitudes `pendiente`. Un `paciente` solo puede cancelar las suyas.',
  roles: ['recepcionista', 'administrador', 'paciente'],
  ticket: 'HUNI-70',
  request: { params: idParamSchema, body: jsonBody(cancelarSolicitudBodySchema) },
  response: { description: 'Solicitud cancelada', schema: SolicitudAmbulanciaSchema },
  errores: { 422: ['TRANSICION_INVALIDA'] },
});

registerEndpoint({
  method: 'get',
  path: '/api/ambulancia/bitacora',
  tag: TAG,
  summary: 'Bitácora de la ambulancia',
  description: 'Historial de cambios de estado y emergencias atendidas, con filtros por fecha, estado y prioridad.',
  roles: ['administrador', 'recepcionista', 'doctor'],
  ticket: 'HUNI-70',
  request: { query: bitacoraQuerySchema },
  response: { description: 'Página de la bitácora', schema: paginado(BitacoraAmbulanciaSchema) },
});
