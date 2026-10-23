import { CamaSchema, HabitacionSchema, HospitalizacionSchema } from '../../domain/dtos/habitaciones.dto';
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
  'La BD garantiza 1 paciente por cama, 1 cama por paciente y la capacidad de cada habitación, también con peticiones simultáneas.';

registerEndpoint({
  method: 'get',
  path: '/api/habitaciones',
  tag: TAG,
  summary: 'Mapa de habitaciones',
  description: '11 habitaciones (5 VIP en 3ª planta, 6 semiprivadas en 2ª) con sus 17 camas y el ocupante de cada una.',
  roles: ['administrador', 'recepcionista', 'doctor'],
  ticket: 'HUNI-66',
  request: { query: listarHabitacionesQuerySchema },
  response: { description: 'Habitaciones', schema: z.array(HabitacionSchema) },
});

registerEndpoint({
  method: 'get',
  path: '/api/camas',
  tag: TAG,
  summary: 'Listar camas',
  roles: ['administrador', 'recepcionista'],
  ticket: 'HUNI-66',
  request: { query: listarCamasQuerySchema },
  response: { description: 'Camas', schema: z.array(CamaSchema) },
});

registerEndpoint({
  method: 'get',
  path: '/api/camas/sugerencia',
  tag: TAG,
  summary: 'Sugerir cama libre',
  description: 'Primera cama `disponible` del tipo pedido (VIP en 3ª planta, semiprivada en 2ª).',
  roles: ['administrador', 'recepcionista'],
  ticket: 'HUNI-66',
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
  request: { params: idParamSchema, body: jsonBody(cambiarEstadoCamaBodySchema) },
  response: { description: 'Cama actualizada', schema: CamaSchema },
  errores: { 409: ['CAMA_OCUPADA'] },
});

registerEndpoint({
  method: 'post',
  path: '/api/hospitalizaciones',
  tag: TAG,
  summary: 'Ingresar paciente (asignar cama)',
  description: `Con \`cama_id\` usa esa cama; sin ella, asigna la sugerida para \`tipo_habitacion\`. ${CAPACIDAD} ${REALTIME}`,
  roles: ['administrador', 'recepcionista'],
  ticket: 'HUNI-66',
  request: { body: jsonBody(crearHospitalizacionBodySchema) },
  response: { status: 201, description: 'Paciente ingresado', schema: HospitalizacionSchema },
  errores: {
    400: ['REFERENCIA_INVALIDA'],
    409: ['CAMA_OCUPADA', 'CAMA_NO_DISPONIBLE', 'PACIENTE_YA_HOSPITALIZADO', 'SIN_CAMAS_DISPONIBLES'],
  },
});

registerEndpoint({
  method: 'get',
  path: '/api/hospitalizaciones',
  tag: TAG,
  summary: 'Listar hospitalizaciones',
  description: 'Un `doctor` ve las de sus pacientes; un `paciente`, solo la propia (HUNI-94).',
  roles: ['administrador', 'recepcionista', 'doctor', 'paciente'],
  ticket: 'HUNI-66',
  request: { query: listarHospitalizacionesQuerySchema },
  response: { description: 'Página de hospitalizaciones', schema: paginado(HospitalizacionSchema) },
});

registerEndpoint({
  method: 'get',
  path: '/api/hospitalizaciones/{id}',
  tag: TAG,
  summary: 'Detalle de una hospitalización',
  roles: ['administrador', 'recepcionista', 'doctor', 'paciente'],
  ticket: 'HUNI-66',
  request: { params: idParamSchema },
  response: { description: 'Hospitalización', schema: HospitalizacionSchema },
});

registerEndpoint({
  method: 'post',
  path: '/api/hospitalizaciones/{id}/alta',
  tag: TAG,
  summary: 'Dar de alta',
  description: `Cierra la hospitalización (queda en el historial) y la cama pasa a \`limpieza\`. ${REALTIME}`,
  roles: ['administrador', 'recepcionista'],
  ticket: 'HUNI-66',
  request: { params: idParamSchema, body: jsonBody(altaBodySchema) },
  response: { description: 'Alta registrada', schema: HospitalizacionSchema },
  errores: { 409: ['HOSPITALIZACION_FINALIZADA'] },
});

registerEndpoint({
  method: 'post',
  path: '/api/hospitalizaciones/{id}/traslado',
  tag: TAG,
  summary: 'Trasladar a otra cama',
  description: `Libera la cama actual (pasa a \`limpieza\`) y ocupa la nueva en una sola transacción. ${CAPACIDAD} ${REALTIME}`,
  roles: ['administrador', 'recepcionista'],
  ticket: 'HUNI-67',
  request: { params: idParamSchema, body: jsonBody(trasladoBodySchema) },
  response: { description: 'Traslado realizado', schema: HospitalizacionSchema },
  errores: { 400: ['REFERENCIA_INVALIDA'], 409: ['CAMA_OCUPADA', 'CAMA_NO_DISPONIBLE', 'HOSPITALIZACION_FINALIZADA'] },
});
