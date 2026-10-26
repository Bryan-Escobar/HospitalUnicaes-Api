import {
  ConsultaDetalleSchema,
  ConsultaSchema,
  DiagnosticoSchema,
  HistorialClinicoSchema,
  RecetaSchema,
} from '../../domain/dtos/consultas.dto';
import { ExpedienteSchema } from '../../domain/dtos/pacientes.dto';
import { idParamSchema } from '../../domain/validators/common.validator';
import {
  actualizarConsultaBodySchema,
  crearConsultaBodySchema,
  crearDiagnosticoBodySchema,
  crearRecetaBodySchema,
  listarConsultasQuerySchema,
} from '../../domain/validators/consultas.validator';
import { actualizarExpedienteBodySchema } from '../../domain/validators/pacientes.validator';
import { jsonBody, paginado, registerEndpoint } from '../registry';

const TAG = 'Consultas';
const PRIVADO =
  'Acceso: el médico tratante, el propio paciente y administración. Cualquier otro → 403 `ACCESO_DENEGADO`.';
const AUTOR =
  'Solo el doctor que registró la consulta y mientras esté abierta; queda como `registrado_por` con su fecha.';

registerEndpoint({
  method: 'post',
  path: '/api/consultas',
  tag: TAG,
  summary: 'Registrar consulta',
  description:
    'El doctor se toma del token. Cualquier doctor puede abrir una consulta a un paciente activo (p. ej. emergencias) ' +
    'y desde ese momento es su médico tratante. Si incluye `cita_id`, la cita debe ser suya, del mismo paciente y estar ' +
    '`programada` o `confirmada`; queda `atendida`.',
  roles: ['doctor'],
  ticket: 'HUNI-57',
  estado: 'implementado',
  request: { body: jsonBody(crearConsultaBodySchema) },
  response: { status: 201, description: 'Consulta creada', schema: ConsultaSchema },
  errores: {
    400: ['REFERENCIA_INVALIDA'],
    403: ['PERFIL_INCOMPLETO'],
    409: ['REGISTRO_DUPLICADO'],
    422: ['REGLA_DE_NEGOCIO', 'TRANSICION_INVALIDA'],
  },
});

registerEndpoint({
  method: 'get',
  path: '/api/consultas',
  tag: TAG,
  summary: 'Listar consultas',
  description: 'De la más reciente a la más antigua. Un `doctor` ve las que registró; un `paciente`, solo las propias.',
  roles: ['administrador', 'doctor', 'paciente'],
  ticket: 'HUNI-57',
  estado: 'implementado',
  request: { query: listarConsultasQuerySchema },
  response: { description: 'Página de consultas', schema: paginado(ConsultaSchema) },
  errores: { 403: ['PERFIL_INCOMPLETO'] },
});

registerEndpoint({
  method: 'get',
  path: '/api/consultas/{id}',
  tag: TAG,
  summary: 'Detalle de una consulta',
  description: `Incluye diagnósticos, recetas y órdenes de laboratorio. ${PRIVADO}`,
  roles: ['administrador', 'doctor', 'paciente'],
  ticket: 'HUNI-57',
  estado: 'implementado',
  request: { params: idParamSchema },
  response: { description: 'Consulta', schema: ConsultaDetalleSchema },
});

registerEndpoint({
  method: 'patch',
  path: '/api/consultas/{id}',
  tag: TAG,
  summary: 'Editar consulta',
  description: 'Solo el doctor que la registró y mientras esté abierta.',
  roles: ['doctor'],
  ticket: 'HUNI-57',
  estado: 'implementado',
  request: { params: idParamSchema, body: jsonBody(actualizarConsultaBodySchema) },
  response: { description: 'Consulta actualizada', schema: ConsultaSchema },
  errores: { 400: ['SOLICITUD_INVALIDA'], 409: ['CONSULTA_CERRADA'] },
});

registerEndpoint({
  method: 'post',
  path: '/api/consultas/{id}/diagnosticos',
  tag: TAG,
  summary: 'Agregar diagnóstico',
  description: AUTOR,
  roles: ['doctor'],
  ticket: 'HUNI-57',
  estado: 'implementado',
  request: { params: idParamSchema, body: jsonBody(crearDiagnosticoBodySchema) },
  response: { status: 201, description: 'Diagnóstico agregado', schema: DiagnosticoSchema },
  errores: { 409: ['CONSULTA_CERRADA'] },
});

registerEndpoint({
  method: 'post',
  path: '/api/consultas/{id}/recetas',
  tag: TAG,
  summary: 'Emitir receta',
  description:
    `${AUTOR} La receta **no descuenta stock**: \`item_id\` es una referencia opcional al inventario ` +
    '(el paciente compra sus medicamentos donde quiera, HUNI-97).',
  roles: ['doctor'],
  ticket: 'HUNI-57',
  estado: 'implementado',
  request: { params: idParamSchema, body: jsonBody(crearRecetaBodySchema) },
  response: { status: 201, description: 'Receta emitida', schema: RecetaSchema },
  errores: { 400: ['REFERENCIA_INVALIDA'], 409: ['CONSULTA_CERRADA'] },
});

registerEndpoint({
  method: 'get',
  path: '/api/pacientes/{id}/historial',
  tag: TAG,
  summary: 'Historial clínico del paciente',
  description: `Expediente y todas sus consultas con diagnósticos, recetas y laboratorio. ${PRIVADO}`,
  roles: ['administrador', 'doctor', 'paciente'],
  ticket: 'HUNI-57',
  estado: 'implementado',
  request: { params: idParamSchema },
  response: { description: 'Historial clínico', schema: HistorialClinicoSchema },
});

registerEndpoint({
  method: 'patch',
  path: '/api/pacientes/{id}/expediente',
  tag: TAG,
  summary: 'Actualizar expediente',
  description: 'Tipo de sangre, alergias, antecedentes y enfermedades crónicas. Solo el médico tratante.',
  roles: ['doctor'],
  ticket: 'HUNI-57',
  estado: 'implementado',
  request: { params: idParamSchema, body: jsonBody(actualizarExpedienteBodySchema) },
  response: { description: 'Expediente actualizado', schema: ExpedienteSchema },
  errores: { 400: ['SOLICITUD_INVALIDA'], 403: ['PERFIL_INCOMPLETO'] },
});

registerEndpoint({
  method: 'post',
  path: '/api/consultas/{id}/cerrar',
  tag: TAG,
  summary: 'Cerrar consulta',
  description:
    'Fija `cerrada_en`. Desde ese momento la consulta, sus diagnósticos, recetas y órdenes de laboratorio ya no se ' +
    'editan (la base de datos lo impide). Solo el doctor que la registró.',
  roles: ['doctor'],
  ticket: 'HUNI-57',
  estado: 'implementado',
  request: { params: idParamSchema },
  response: { description: 'Consulta cerrada', schema: ConsultaSchema },
  errores: { 409: ['CONSULTA_CERRADA'] },
});
