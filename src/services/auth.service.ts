import { logger } from '../config/logger';
import { MeSchema, PerfilSchema } from '../domain/dtos/auth.dto';
import { CustomError } from '../domain/errors/CustomError';
import { UsuarioAutenticado } from '../domain/interfaces';
import { ActualizarMiPerfilBody, RegistroPacienteBody } from '../domain/validators/auth.validator';
import { supabaseJwtVerifier, SupabaseJwtVerifier } from '../lib/supabase-jwt';
import { z } from '../lib/zod';
import { AuthRepository, Perfil, PerfilConRelaciones } from '../repositories/auth.repository';
import { SupabaseAuthRepository } from '../repositories/supabase-auth.repository';

export type Me = z.infer<typeof MeSchema>;
export type PerfilDto = z.infer<typeof PerfilSchema>;

export class AuthService {
  constructor(
    private readonly authRepository = new AuthRepository(),
    private readonly supabaseAuthRepository = new SupabaseAuthRepository(),
    private readonly jwtVerifier: SupabaseJwtVerifier = supabaseJwtVerifier,
  ) {}

  /** Valida el JWT de Supabase y carga el rol desde `perfiles` (fuente de verdad del rol, no el token). */
  async autenticar(token: string): Promise<UsuarioAutenticado> {
    let id: string;
    try {
      id = await this.jwtVerifier.verify(token);
    } catch {
      throw CustomError.unauthorized('Token inválido o expirado');
    }

    const perfil = await this.authRepository.findPerfilSesion(id);
    if (!perfil) throw CustomError.unauthorized('La cuenta de la sesión ya no existe');
    if (!perfil.activo) throw CustomError.fromCode('CUENTA_INACTIVA');
    return { id: perfil.id, rol: perfil.rol };
  }

  async getMe(id: string): Promise<Me> {
    const perfil = await this.authRepository.findPerfilCompleto(id);
    if (!perfil) throw CustomError.unauthorized('La cuenta de la sesión ya no existe');
    return toMe(perfil);
  }

  /**
   * Registro público: el body no trae rol y la cuenta siempre queda como `paciente`.
   * Si falla algo después de crear la cuenta en Supabase Auth, se borra para no dejar cuentas a medias.
   */
  async registrarPaciente(body: RegistroPacienteBody): Promise<Me> {
    const { email, password, ...datos } = body;
    if (datos.documento_identidad && (await this.authRepository.existeDocumento(datos.documento_identidad))) {
      throw CustomError.conflict('Ya existe un paciente con ese documento de identidad', 'REGISTRO_DUPLICADO');
    }

    const perfilId = await this.supabaseAuthRepository.crearUsuario({
      email,
      password,
      nombres: datos.nombres,
      apellidos: datos.apellidos,
    });
    try {
      return toMe(await this.authRepository.crearPaciente(perfilId, datos));
    } catch (error) {
      await this.revertirCuenta(perfilId);
      throw error;
    }
  }

  async actualizarMiPerfil(id: string, cambios: ActualizarMiPerfilBody): Promise<PerfilDto> {
    if (Object.keys(cambios).length === 0) throw CustomError.badRequest('Envía al menos un campo para actualizar');
    return toPerfil(await this.authRepository.actualizarPerfil(id, cambios));
  }

  async revertirCuenta(perfilId: string): Promise<void> {
    try {
      await this.supabaseAuthRepository.eliminarUsuario(perfilId);
    } catch (err) {
      logger.error({ err, perfilId }, 'No se pudo revertir la cuenta creada en Supabase Auth');
    }
  }
}

const toPerfil = (p: Perfil): PerfilDto => ({
  id: p.id,
  email: p.email,
  nombres: p.nombres,
  apellidos: p.apellidos,
  telefono: p.telefono,
  avatar_url: p.avatar_url,
  rol: p.rol,
  activo: p.activo,
  created_at: p.created_at.toISOString(),
});

/** El paciente necesita su ficha y el personal su registro de empleado; si falta → PERFIL_INCOMPLETO. */
const toMe = (p: PerfilConRelaciones): Me => {
  const incompleto = p.rol === 'paciente' ? !p.pacientes : !p.personal;
  if (incompleto) throw CustomError.fromCode('PERFIL_INCOMPLETO');

  return {
    ...toPerfil(p),
    paciente_id: p.pacientes?.id ?? null,
    personal: p.personal
      ? {
          id: p.personal.id,
          tipo: p.personal.tipos_personal,
          especialidad: p.personal.especialidades?.nombre ?? null,
          codigo_empleado: p.personal.codigo_empleado,
        }
      : null,
  };
};
