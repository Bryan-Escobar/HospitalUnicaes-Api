import { AvisoEliminadoSchema, AvisoSchema } from '../../domain/dtos/avisos.dto';
import { ROLES } from '../../domain/dtos/enums';
import {
  actualizarAvisoBodySchema,
  crearAvisoBodySchema,
  listarAvisosQuerySchema,
} from '../../domain/validators/avisos.validator';
import { idParamSchema } from '../../domain/validators/common.validator';
import { jsonBody, paginado, registerEndpoint } from '../registry';

const TAG = 'Avisos';
const VISIBILIDAD =
  'Los públicos y vigentes los ve cualquiera (también salen sin sesión en `GET /api/publico/estado`); ' +
  'los internos (`es_publico: false`) vigentes, solo el personal; programados y vencidos, solo el administrador.';

registerEndpoint({
  method: 'get',
  path: '/api/avisos',
  tag: TAG,
  summary: 'Listar avisos',
  description: `${VISIBILIDAD} Más recientes primero. Un paciente recibe solo avisos públicos.`,
  roles: [...ROLES],
  ticket: 'HUNI-74',
  estado: 'implementado',
  request: { query: listarAvisosQuerySchema },
  response: { description: 'Página de avisos', schema: paginado(AvisoSchema) },
});

registerEndpoint({
  method: 'post',
  path: '/api/avisos',
  tag: TAG,
  summary: 'Publicar un aviso',
  description:
    'Sin `fecha_publicacion` se publica ya; con una fecha futura queda programado. El autor es la cuenta de la sesión.',
  roles: ['administrador'],
  ticket: 'HUNI-74',
  estado: 'implementado',
  request: { body: jsonBody(crearAvisoBodySchema) },
  response: { status: 201, description: 'Aviso publicado', schema: AvisoSchema },
  errores: { 422: ['REGLA_DE_NEGOCIO'] },
});

registerEndpoint({
  method: 'get',
  path: '/api/avisos/{id}',
  tag: TAG,
  summary: 'Detalle de un aviso',
  description: `${VISIBILIDAD} Un aviso que la sesión no puede ver responde 404, igual que uno que no existe.`,
  roles: [...ROLES],
  ticket: 'HUNI-74',
  estado: 'implementado',
  request: { params: idParamSchema },
  response: { description: 'Aviso', schema: AvisoSchema },
});

registerEndpoint({
  method: 'patch',
  path: '/api/avisos/{id}',
  tag: TAG,
  summary: 'Editar un aviso',
  description:
    'Solo se envían los campos que cambian. `fecha_expiracion: null` quita la expiración. ' +
    'La expiración siempre debe quedar después de la publicación (422 `REGLA_DE_NEGOCIO`).',
  roles: ['administrador'],
  ticket: 'HUNI-74',
  estado: 'implementado',
  request: { params: idParamSchema, body: jsonBody(actualizarAvisoBodySchema) },
  response: { description: 'Aviso actualizado', schema: AvisoSchema },
  errores: { 422: ['REGLA_DE_NEGOCIO'] },
});

registerEndpoint({
  method: 'delete',
  path: '/api/avisos/{id}',
  tag: TAG,
  summary: 'Eliminar un aviso',
  description: 'Lo borra definitivamente. Para retirarlo sin borrarlo, edita su `fecha_expiracion`.',
  roles: ['administrador'],
  ticket: 'HUNI-74',
  estado: 'implementado',
  request: { params: idParamSchema },
  response: { description: 'Aviso eliminado', schema: AvisoEliminadoSchema },
});
