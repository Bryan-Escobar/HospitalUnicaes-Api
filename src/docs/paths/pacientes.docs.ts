import { PacienteSchema } from '../../domain/dtos/pacientes.dto';
import { idParamSchema } from '../../domain/validators/common.validator';
import {
  actualizarPacienteBodySchema,
  crearPacienteBodySchema,
  listarPacientesQuerySchema,
} from '../../domain/validators/pacientes.validator';
import { jsonBody, paginado, registerEndpoint } from '../registry';

const TAG = 'Pacientes';

registerEndpoint({
  method: 'get',
  path: '/api/pacientes',
  tag: TAG,
  summary: 'Listar pacientes',
  description:
    'Paginado y con búsqueda. Un `doctor` solo ve a los pacientes que atiende (consulta, cita u hospitalización).',
  roles: ['administrador', 'recepcionista', 'doctor'],
  ticket: 'HUNI-45',
  request: { query: listarPacientesQuerySchema },
  response: { description: 'Página de pacientes', schema: paginado(PacienteSchema) },
});

registerEndpoint({
  method: 'post',
  path: '/api/pacientes',
  tag: TAG,
  summary: 'Registrar paciente en recepción',
  description: 'Para pacientes sin cuenta. Crea también su expediente con número correlativo.',
  roles: ['administrador', 'recepcionista'],
  ticket: 'HUNI-45',
  request: { body: jsonBody(crearPacienteBodySchema) },
  response: { status: 201, description: 'Paciente creado', schema: PacienteSchema },
  errores: { 409: ['REGISTRO_DUPLICADO'] },
});

registerEndpoint({
  method: 'get',
  path: '/api/pacientes/{id}',
  tag: TAG,
  summary: 'Detalle de un paciente',
  description: 'Un `paciente` solo puede pedir su propio id; un `doctor`, solo pacientes que atiende.',
  roles: ['administrador', 'recepcionista', 'doctor', 'paciente'],
  ticket: 'HUNI-45',
  request: { params: idParamSchema },
  response: { description: 'Paciente', schema: PacienteSchema },
});

registerEndpoint({
  method: 'patch',
  path: '/api/pacientes/{id}',
  tag: TAG,
  summary: 'Actualizar datos personales',
  description: 'Un `paciente` solo puede editar sus propios datos.',
  roles: ['administrador', 'recepcionista', 'paciente'],
  ticket: 'HUNI-45',
  request: { params: idParamSchema, body: jsonBody(actualizarPacienteBodySchema) },
  response: { description: 'Paciente actualizado', schema: PacienteSchema },
  errores: { 409: ['REGISTRO_DUPLICADO'] },
});
