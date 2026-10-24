import { supabaseAdmin } from '../config/supabase';
import { CustomError } from '../domain/errors/CustomError';

export interface NuevaCuenta {
  email: string;
  password: string;
  nombres: string;
  apellidos: string;
}

/**
 * Cuentas de Supabase Auth con la llave de servicio.
 * Al crear el usuario, el trigger `on_auth_user_created` crea su fila en `perfiles` con rol `paciente`;
 * el rol definitivo lo pone siempre el backend, nunca la metadata que manda el cliente.
 */
export class SupabaseAuthRepository {
  /** Crea la cuenta ya confirmada (puede iniciar sesión de inmediato) y devuelve su id. */
  async crearUsuario({ email, password, nombres, apellidos }: NuevaCuenta): Promise<string> {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombres, apellidos },
    });

    if (error) {
      if (error.code === 'email_exists' || error.code === 'user_already_exists') {
        throw CustomError.fromCode('EMAIL_EN_USO', 'Ya existe una cuenta con ese correo');
      }
      if (error.code === 'weak_password') {
        throw CustomError.badRequest('La contraseña no cumple la política de seguridad');
      }
      throw error;
    }
    return data.user.id;
  }

  async eliminarUsuario(id: string): Promise<void> {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
}
