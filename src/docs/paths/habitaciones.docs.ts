import {
  CamaSchema,
  HabitacionSchema,
  HospitalizacionDetalleSchema,
  HospitalizacionSchema,
} from '../../domain/dtos/habitaciones.dto';
import { idParamSchema } from '../../domain/validators/common.validator';
import {
  altaBodySchema,
  cambiarEstadoCamaBodySchema,
  crearHospitalizacionBodySchema,
  listarCamasQuerySchema,
  listarHabitacionesQuerySchema,
  listarHospitalizacionesQuerySchema,
  sugerenciaCamaQuerySchema,
  trasladoBodySchema,
} from '../../domain/validators/habitaciones.validator';
import { z } from '../../lib/zod';
import { jsonBody, paginado, registerEndpoint } from '../registry';

const TAG = 'Habitaciones';
const REALTIME = 'Los cambios de ocupación se emiten por Supabase Realtime (tablas `camas` y `hospitalizaciones`).';
const CAPACIDAD =
  'La BD garantiza 1 paciente por cama, 1 cama por paciente y la capacidad de cada habitación (VIP 1, semiprivada 2), ' +
  'también con peticiones simultáneas: bloquea la fila de la cama y solo una solicitud gana.';
const HISTORIAL = 'Cada ingreso, traslado y alta queda en `movimientos` con quién lo registró.';

registerEndpoint({
  method: 'get',
  path: '/api/habitaciones',
  tag: TAG,
  summary: 'Mapa de habitaciones',
  description:
    '11 habitaciones (5 VIP en 3ª planta, 6 semiprivadas en 2ª) con sus 17 camas y el ocupante de cada una ' +
    '(con su `sexo`, para que el cliente lo marque). Un `doctor` solo ve el ocupante si es su médico tratante; ' +
    `si no, la cama sale \`ocupada\` con \`ocupante: null\`. ${REALTIME}`,
  roles: ['administrador', 'recepcionista', 'doctor'],
  ticket: 'HUNI-66',
  estado: 'implementado',
  request: { query: listarHabitacionesQuerySchema },
  response: { description: 'Habitaciones', schema: z.array(HabitacionSchema) },
  errores: { 403: ['PERFIL_INCOMPLETO'] },
});

registerEndpoint({
  method: 'get',
  path: '/api/camas',
  tag: TAG,
  summary: 'Listar camas',
  roles: ['administrador', 'recepcionista'],
  ticket: 'HUNI-66',
  estado: 'implementado',
  request: { query: listarCamasQuerySchema },
  response: { description: 'Camas', schema: z.array(CamaSchema) },
});

registerEndpoint({
  method: 'get',
  path: '/api/camas/sugerencia',
  tag: TAG,
  summary: 'Sugerir cama libre',
  description:
    'Cama `disponible` del tipo pedido (VIP en 3ª planta, semiprivada en 2ª). Prefiere habitaciones vacías ' +
    '(privacidad y control de infecciones); si no hay, cualquier cama libre. No bloquea la cama: el ingreso la vuelve ' +
    'a elegir con bloqueo.',
  roles: ['administrador', 'recepcionista'],
  ticket: 'HUNI-66',
  estado: 'implementado',
  request: { query: sugerenciaCamaQuerySchema },
  response: { description: 'Cama sugerida', schema: CamaSchema },
  errores: { 409: ['SIN_CAMAS_DISPONIBLES'] },
});

registerEndpoint({
  method: 'patch',
  path: '/api/camas/{id}/estado',
  tag: TAG,
  summary: 'Cambiar estado de una cama',
  description: 'Típicamente `limpieza → disponible` después de un alta. No se puede cambiar una cama ocupada.',
  roles: ['administrador', 'recepcionista'],
  ticket: 'HUNI-66',
  estado: 'implementado',
  request: { params: idParamSchema, body: jsonBody(cambiarEstadoCamaBodySchema) },
  response: { description: 'Cama actualizada', schema: CamaSchema },
  errores: { 409: ['CAMA_OCUPADA'], 422: ['REGLA_DE_NEGOCIO'] },
});

registerEndpoint({
  method: 'post',
  path: '/api/hospitalizaciones',
  tag: TAG,
  summary: 'Ingresar paciente (asignar cama)',
  description:
    `Con \`cama_id\` usa esa cama; sin ella, asigna la sugerida para \`tipo_habitacion\`. El doctor tratante debe ` +
    `ser un médico activo. ${CAPACIDAD} ${HISTORIAL} ${REALTIME}`,
  roles: ['administrador', 'recepcionista'],
  ticket: 'HUNI-66',
  estado: 'implementado',
  request: { body: jsonBody(crearHospitalizacionBodySchema) },
  response: { status: 201, description: 'Paciente ingresado', schema: HospitalizacionDetalleSchema },
  errores: {
    400: ['REFERENCIA_INVALIDA', 'SOLICITUD_INVALIDA'],
    422: ['REGLA_DE_NEGOCIO'],
    409: ['CAMA_OCUPADA', 'CAMA_NO_DISPONIBLE', 'PACIENTE_YA_HOSPITALIZADO', 'SIN_CAMAS_DISPONIBLES'],
  },
});

registerEndpoint({
  method: 'get',
  path: '/api/hospitalizaciones',
  tag: TAG,
  summary: 'Listar hospitalizaciones',
  description:
    'De la más reciente a la más antigua. Administración y recepción ven todas; un `doctor`, las de los pacientes ' +
    'que atiende; un `paciente`, solo las propias.',
  roles: ['administrador', 'recepcionista', 'doctor', 'paciente'],
  ticket: 'HUNI-66',
  estado: 'implementado',
  request: { query: listarHospitalizacionesQuerySchema },
  response: { description: 'Página de hospitalizaciones', schema: paginado(HospitalizacionSchema) },
  errores: { 403: ['PERFIL_INCOMPLETO'] },
});

registerEndpoint({
  method: 'get',
  path: '/api/hospitalizaciones/{id}',
  tag: TAG,
  summary: 'Detalle de una hospitalización',
  description: `Con su historial de camas. ${HISTORIAL} Acceso: administración, recepción, el médico tratante y el paciente.`,
  roles: ['administrador', 'recepcionista', 'doctor', 'paciente'],
  ticket: 'HUNI-66',
  estado: 'implementado',
  request: { params: idParamSchema },
  response: { description: 'Hospitalización', schema: HospitalizacionDetalleSchema },
  errores: { 403: ['PERFIL_INCOMPLETO'] },
});

registerEndpoint({
  method: 'post',
  path: '/api/hospitalizaciones/{id}/alta',
  tag: TAG,
  summary: 'Dar de alta',
  description:
    `Cierra la hospitalización (se conserva con sus notas) y la cama pasa a \`limpieza\`; recepción la marca ` +
    `\`disponible\` cuando esté lista. ${HISTORIAL} ${REALTIME}`,
  roles: ['administrador', 'recepcionista'],
  ticket: 'HUNI-66',
  estado: 'implementado',
  request: { params: idParamSchema, body: jsonBody(altaBodySchema) },
  response: { description: 'Alta registrada', schema: HospitalizacionDetalleSchema },
  errores: { 409: ['HOSPITALIZACION_FINALIZADA'] },
});

registerEndpoint({
  method: 'post',
  path: '/api/hospitalizaciones/{id}/traslado',
  tag: TAG,
  summary: 'Trasladar a otra cama',
  description:
    `Libera la cama actual (pasa a \`limpieza\`) y ocupa la nueva en una sola transacción. ${CAPACIDAD} ` +
    `${HISTORIAL} ${REALTIME}`,
  roles: ['administrador', 'recepcionista'],
  ticket: 'HUNI-66',
  estado: 'implementado',
  request: { params: idParamSchema, body: jsonBody(trasladoBodySchema) },
  response: { description: 'Traslado realizado', schema: HospitalizacionDetalleSchema },
  errores: {
    400: ['REFERENCIA_INVALIDA', 'SOLICITUD_INVALIDA'],
    409: ['CAMA_OCUPADA', 'CAMA_NO_DISPONIBLE', 'HOSPITALIZACION_FINALIZADA'],
  },
});
