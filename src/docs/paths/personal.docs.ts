import { ROLES } from '../../domain/dtos/enums';
import { EspecialidadSchema, PersonalSchema } from '../../domain/dtos/personal.dto';
import { idParamSchema } from '../../domain/validators/common.validator';
import {
  actualizarPersonalBodySchema,
  crearPersonalBodySchema,
  listarPersonalQuerySchema,
} from '../../domain/validators/personal.validator';
import { z } from '../../lib/zod';
import { jsonBody, paginado, registerEndpoint } from '../registry';

const TAG = 'Personal';

registerEndpoint({
  method: 'get',
  path: '/api/personal',
  tag: TAG,
  summary: 'Listar personal',
  roles: ['administrador', 'recepcionista'],
  ticket: 'HUNI-45',
  request: { query: listarPersonalQuerySchema },
  response: { description: 'Página de personal', schema: paginado(PersonalSchema) },
});

registerEndpoint({
  method: 'post',
  path: '/api/personal',
  tag: TAG,
  summary: 'Dar de alta a un empleado',
  description:
    'Crea la cuenta en Supabase Auth (service role), su perfil con el rol indicado y el registro de personal.',
  roles: ['administrador'],
  ticket: 'HUNI-45',
  request: { body: jsonBody(crearPersonalBodySchema) },
  response: { status: 201, description: 'Empleado creado', schema: PersonalSchema },
  errores: { 400: ['REFERENCIA_INVALIDA'], 409: ['EMAIL_EN_USO', 'REGISTRO_DUPLICADO'] },
});

registerEndpoint({
  method: 'get',
  path: '/api/personal/{id}',
  tag: TAG,
  summary: 'Detalle de un empleado',
  roles: ['administrador', 'recepcionista'],
  ticket: 'HUNI-45',
  request: { params: idParamSchema },
  response: { description: 'Empleado', schema: PersonalSchema },
});

registerEndpoint({
  method: 'patch',
  path: '/api/personal/{id}',
  tag: TAG,
  summary: 'Actualizar empleado',
  description: 'Cambiar `rol` actualiza también el perfil de su cuenta.',
  roles: ['administrador'],
  ticket: 'HUNI-45',
  request: { params: idParamSchema, body: jsonBody(actualizarPersonalBodySchema) },
  response: { description: 'Empleado actualizado', schema: PersonalSchema },
  errores: { 400: ['REFERENCIA_INVALIDA'], 409: ['REGISTRO_DUPLICADO'] },
});

registerEndpoint({
  method: 'delete',
  path: '/api/personal/{id}',
  tag: TAG,
  summary: 'Desactivar empleado',
  description: 'Desactivación lógica (`activo = false`): no borra datos ni su historial.',
  roles: ['administrador'],
  ticket: 'HUNI-45',
  request: { params: idParamSchema },
  response: { description: 'Empleado desactivado', schema: PersonalSchema },
});

registerEndpoint({
  method: 'get',
  path: '/api/especialidades',
  tag: TAG,
  summary: 'Catálogo de especialidades',
  roles: [...ROLES],
  ticket: 'HUNI-45',
  response: { description: 'Especialidades', schema: z.array(EspecialidadSchema) },
});
