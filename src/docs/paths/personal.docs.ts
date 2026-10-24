import { ROLES } from '../../domain/dtos/enums';
import { EspecialidadSchema, PersonalSchema, TipoPersonalSchema } from '../../domain/dtos/personal.dto';
import { idParamSchema } from '../../domain/validators/common.validator';
import {
  actualizarPersonalBodySchema,
  actualizarTipoPersonalBodySchema,
  crearPersonalBodySchema,
  crearTipoPersonalBodySchema,
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
    'Crea el registro de personal. La cuenta es opcional: con `email` y `password` también crea la cuenta en ' +
    'Supabase Auth (service role) y su perfil con el `rol` indicado (o el `rol_sugerido` del tipo). ' +
    'Sin `email`, el empleado solo aparece en turnos.',
  roles: ['administrador'],
  ticket: 'HUNI-38',
  estado: 'implementado',
  request: { body: jsonBody(crearPersonalBodySchema) },
  response: { status: 201, description: 'Empleado creado', schema: PersonalSchema },
  errores: { 400: ['REFERENCIA_INVALIDA', 'SOLICITUD_INVALIDA'], 409: ['EMAIL_EN_USO', 'REGISTRO_DUPLICADO'] },
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
  description:
    'Cambiar `rol` actualiza el perfil de su cuenta; si el empleado no tiene cuenta → 400 `SOLICITUD_INVALIDA`.',
  roles: ['administrador'],
  ticket: 'HUNI-45',
  request: { params: idParamSchema, body: jsonBody(actualizarPersonalBodySchema) },
  response: { description: 'Empleado actualizado', schema: PersonalSchema },
  errores: { 400: ['REFERENCIA_INVALIDA', 'SOLICITUD_INVALIDA'], 409: ['REGISTRO_DUPLICADO'] },
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

registerEndpoint({
  method: 'get',
  path: '/api/tipos-personal',
  tag: TAG,
  summary: 'Catálogo de tipos de personal',
  description: 'Doctor, Enfermero/a, Alergista, etc. Es editable: el PDF dice "entre otros" (HUNI-34).',
  roles: [...ROLES],
  ticket: 'HUNI-46',
  response: { description: 'Tipos de personal', schema: z.array(TipoPersonalSchema) },
});

registerEndpoint({
  method: 'post',
  path: '/api/tipos-personal',
  tag: TAG,
  summary: 'Agregar tipo de personal',
  roles: ['administrador'],
  ticket: 'HUNI-46',
  request: { body: jsonBody(crearTipoPersonalBodySchema) },
  response: { status: 201, description: 'Tipo creado', schema: TipoPersonalSchema },
  errores: { 409: ['REGISTRO_DUPLICADO'] },
});

registerEndpoint({
  method: 'patch',
  path: '/api/tipos-personal/{id}',
  tag: TAG,
  summary: 'Editar o desactivar tipo de personal',
  description: 'No se borran: se desactivan (`activo = false`) porque puede haber personal con ese tipo.',
  roles: ['administrador'],
  ticket: 'HUNI-46',
  request: { params: idParamSchema, body: jsonBody(actualizarTipoPersonalBodySchema) },
  response: { description: 'Tipo actualizado', schema: TipoPersonalSchema },
  errores: { 409: ['REGISTRO_DUPLICADO'] },
});
