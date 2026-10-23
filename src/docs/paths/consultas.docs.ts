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

registerEndpoint({
  method: 'post',
  path: '/api/consultas',
  tag: TAG,
  summary: 'Registrar consulta',
  description: 'El doctor se toma del token. Si incluye `cita_id`, la cita queda `atendida`.',
  roles: ['doctor'],
  ticket: 'HUNI-57',
  request: { body: jsonBody(crearConsultaBodySchema) },
  response: { status: 201, description: 'Consulta creada', schema: ConsultaSchema },
  errores: { 400: ['REFERENCIA_INVALIDA'], 409: ['REGISTRO_DUPLICADO'] },
});

registerEndpoint({
  method: 'get',
  path: '/api/consultas',
  tag: TAG,
  summary: 'Listar consultas',
  description: 'Un `doctor` ve las suyas; un `paciente`, solo las propias.',
  roles: ['administrador', 'doctor', 'paciente'],
  ticket: 'HUNI-57',
  request: { query: listarConsultasQuerySchema },
  response: { description: 'Página de consultas', schema: paginado(ConsultaSchema) },
});

registerEndpoint({
  method: 'get',
  path: '/api/consultas/{id}',
  tag: TAG,
  summary: 'Detalle de una consulta',
  description: `Incluye diagnósticos, recetas y órdenes de laboratorio. ${PRIVADO}`,
  roles: ['administrador', 'doctor', 'paciente'],
  ticket: 'HUNI-57',
  request: { params: idParamSchema },
  response: { description: 'Consulta', schema: ConsultaDetalleSchema },
});

registerEndpoint({
  method: 'patch',
  path: '/api/consultas/{id}',
  tag: TAG,
  summary: 'Editar consulta',
  description: 'Solo el doctor que la registró.',
  roles: ['doctor'],
  ticket: 'HUNI-57',
  request: { params: idParamSchema, body: jsonBody(actualizarConsultaBodySchema) },
  response: { description: 'Consulta actualizada', schema: ConsultaSchema },
});

registerEndpoint({
  method: 'post',
  path: '/api/consultas/{id}/diagnosticos',
  tag: TAG,
  summary: 'Agregar diagnóstico',
  roles: ['doctor'],
  ticket: 'HUNI-57',
  request: { params: idParamSchema, body: jsonBody(crearDiagnosticoBodySchema) },
  response: { status: 201, description: 'Diagnóstico agregado', schema: DiagnosticoSchema },
});

registerEndpoint({
  method: 'post',
  path: '/api/consultas/{id}/recetas',
  tag: TAG,
  summary: 'Emitir receta',
  roles: ['doctor'],
  ticket: 'HUNI-57',
  request: { params: idParamSchema, body: jsonBody(crearRecetaBodySchema) },
  response: { status: 201, description: 'Receta emitida', schema: RecetaSchema },
  errores: { 400: ['REFERENCIA_INVALIDA'] },
});

registerEndpoint({
  method: 'get',
  path: '/api/pacientes/{id}/historial',
  tag: TAG,
  summary: 'Historial clínico del paciente',
  description: `Expediente y todas sus consultas con diagnósticos, recetas y laboratorio. ${PRIVADO}`,
  roles: ['administrador', 'doctor', 'paciente'],
  ticket: 'HUNI-57',
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
  request: { params: idParamSchema, body: jsonBody(actualizarExpedienteBodySchema) },
  response: { description: 'Expediente actualizado', schema: ExpedienteSchema },
});
