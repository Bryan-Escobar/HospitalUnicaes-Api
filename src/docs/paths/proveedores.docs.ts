import { ProveedorSchema } from '../../domain/dtos/proveedores.dto';
import { idParamSchema } from '../../domain/validators/common.validator';
import {
  actualizarProveedorBodySchema,
  crearProveedorBodySchema,
  listarProveedoresQuerySchema,
} from '../../domain/validators/proveedores.validator';
import { jsonBody, paginado, registerEndpoint } from '../registry';

const TAG = 'Proveedores';
const TICKET = 'HUNI-98';

registerEndpoint({
  method: 'get',
  path: '/api/proveedores',
  tag: TAG,
  summary: 'Listar proveedores',
  description: 'Búsqueda por nombre, NIT o NRC. Orden por nombre.',
  roles: ['administrador'],
  ticket: TICKET,
  estado: 'implementado',
  request: { query: listarProveedoresQuerySchema },
  response: { description: 'Página de proveedores', schema: paginado(ProveedorSchema) },
});

registerEndpoint({
  method: 'post',
  path: '/api/proveedores',
  tag: TAG,
  summary: 'Crear un proveedor',
  description: 'NIT y NRC son únicos.',
  roles: ['administrador'],
  ticket: TICKET,
  estado: 'implementado',
  request: { body: jsonBody(crearProveedorBodySchema) },
  response: { status: 201, description: 'Proveedor creado', schema: ProveedorSchema },
  errores: { 409: ['REGISTRO_DUPLICADO'] },
});

registerEndpoint({
  method: 'get',
  path: '/api/proveedores/{id}',
  tag: TAG,
  summary: 'Detalle de un proveedor',
  roles: ['administrador'],
  ticket: TICKET,
  estado: 'implementado',
  request: { params: idParamSchema },
  response: { description: 'Proveedor', schema: ProveedorSchema },
});

registerEndpoint({
  method: 'patch',
  path: '/api/proveedores/{id}',
  tag: TAG,
  summary: 'Editar un proveedor',
  description: 'Solo los campos que cambian. `activo: true` lo reactiva.',
  roles: ['administrador'],
  ticket: TICKET,
  estado: 'implementado',
  request: { params: idParamSchema, body: jsonBody(actualizarProveedorBodySchema) },
  response: { description: 'Proveedor actualizado', schema: ProveedorSchema },
  errores: { 409: ['REGISTRO_DUPLICADO'] },
});

registerEndpoint({
  method: 'delete',
  path: '/api/proveedores/{id}',
  tag: TAG,
  summary: 'Desactivar un proveedor',
  description:
    'No se borra: queda `activo: false`. Ya no se acepta en entradas ni en activos nuevos (`PROVEEDOR_INVALIDO`); ' +
    'lo ya registrado conserva su proveedor.',
  roles: ['administrador'],
  ticket: TICKET,
  estado: 'implementado',
  request: { params: idParamSchema },
  response: { description: 'Proveedor desactivado', schema: ProveedorSchema },
});
