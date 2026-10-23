import { MeSchema, PerfilSchema } from '../../domain/dtos/auth.dto';
import { ROLES } from '../../domain/dtos/enums';
import { actualizarMiPerfilBodySchema, registroPacienteBodySchema } from '../../domain/validators/auth.validator';
import { jsonBody, registerEndpoint } from '../registry';

const TAG = 'Auth';

registerEndpoint({
  method: 'post',
  path: '/api/auth/registro',
  tag: TAG,
  summary: 'Registrar paciente (autoservicio)',
  description:
    'Crea la cuenta en Supabase Auth, su perfil con rol `paciente`, el paciente y su expediente, en una sola ' +
    'operación. El rol no se acepta en el body. Después, el cliente inicia sesión con el SDK de Supabase.',
  roles: 'publico',
  ticket: 'HUNI-38',
  request: { body: jsonBody(registroPacienteBodySchema) },
  response: { status: 201, description: 'Paciente registrado', schema: MeSchema },
  errores: { 409: ['EMAIL_EN_USO', 'REGISTRO_DUPLICADO'] },
});

registerEndpoint({
  method: 'get',
  path: '/api/auth/me',
  tag: TAG,
  summary: 'Usuario de la sesión',
  description:
    'Perfil, rol y, según el caso, el paciente o el registro de personal asociado. Úsalo al iniciar la app para decidir la navegación por rol.',
  roles: [...ROLES],
  ticket: 'HUNI-38',
  response: { description: 'Usuario autenticado', schema: MeSchema },
  errores: { 403: ['PERFIL_INCOMPLETO'] },
});

registerEndpoint({
  method: 'patch',
  path: '/api/auth/me',
  tag: TAG,
  summary: 'Actualizar mi perfil',
  description: 'Solo datos de contacto. El rol y el correo no se cambian aquí.',
  roles: [...ROLES],
  ticket: 'HUNI-38',
  request: { body: jsonBody(actualizarMiPerfilBodySchema) },
  response: { description: 'Perfil actualizado', schema: PerfilSchema },
});
