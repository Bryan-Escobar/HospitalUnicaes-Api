import { supabaseAdmin } from '../../src/config/supabase';
import { SupabaseAuthRepository } from '../../src/repositories/supabase-auth.repository';

const cuenta = { email: 'ana@hospital.sv', password: 'Hospital2026', nombres: 'Ana', apellidos: 'López' };
const repo = new SupabaseAuthRepository();

type CreateUser = typeof supabaseAdmin.auth.admin.createUser;
const respuesta = (r: unknown) => r as Awaited<ReturnType<CreateUser>>;

describe('SupabaseAuthRepository', () => {
  test('crea la cuenta confirmada, sin rol en la metadata, y devuelve su id', async () => {
    const spy = jest
      .spyOn(supabaseAdmin.auth.admin, 'createUser')
      .mockResolvedValue(respuesta({ data: { user: { id: 'nuevo-id' } }, error: null }));

    await expect(repo.crearUsuario(cuenta)).resolves.toBe('nuevo-id');
    expect(spy).toHaveBeenCalledWith({
      email: cuenta.email,
      password: cuenta.password,
      email_confirm: true,
      user_metadata: { nombres: 'Ana', apellidos: 'López' },
    });
  });

  test.each(['email_exists', 'user_already_exists'])('traduce %s a EMAIL_EN_USO', async (code) => {
    jest
      .spyOn(supabaseAdmin.auth.admin, 'createUser')
      .mockResolvedValue(respuesta({ data: { user: null }, error: { code, status: 422, message: 'x' } }));

    await expect(repo.crearUsuario(cuenta)).rejects.toMatchObject({ statusCode: 409, code: 'EMAIL_EN_USO' });
  });

  test('traduce weak_password a 400', async () => {
    jest
      .spyOn(supabaseAdmin.auth.admin, 'createUser')
      .mockResolvedValue(
        respuesta({ data: { user: null }, error: { code: 'weak_password', status: 422, message: 'x' } }),
      );

    await expect(repo.crearUsuario(cuenta)).rejects.toMatchObject({ statusCode: 400 });
  });

  test('propaga errores desconocidos', async () => {
    const error = { code: 'unexpected_failure', status: 500, message: 'x' };
    jest.spyOn(supabaseAdmin.auth.admin, 'createUser').mockResolvedValue(respuesta({ data: { user: null }, error }));

    await expect(repo.crearUsuario(cuenta)).rejects.toBe(error);
  });
});
