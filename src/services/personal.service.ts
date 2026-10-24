import { PersonalSchema } from '../domain/dtos/personal.dto';
import { CustomError } from '../domain/errors/CustomError';
import { CrearPersonalBody } from '../domain/validators/personal.validator';
import { z } from '../lib/zod';
import { PersonalCompleto, PersonalRepository } from '../repositories/personal.repository';
import { SupabaseAuthRepository } from '../repositories/supabase-auth.repository';
import { AuthService } from './auth.service';

export type PersonalDto = z.infer<typeof PersonalSchema>;

export class PersonalService {
  constructor(
    private readonly personalRepository = new PersonalRepository(),
    private readonly supabaseAuthRepository = new SupabaseAuthRepository(),
    private readonly authService = new AuthService(),
  ) {}

  /**
   * Alta de un empleado por el administrador. Con `email`, también crea su cuenta en Supabase Auth
   * (llave de servicio) con el `rol` enviado o el `rol_sugerido` del tipo de personal.
   */
  async crear(body: CrearPersonalBody): Promise<PersonalDto> {
    const { email, password, rol, ...datos } = body;

    const tipo = await this.personalRepository.findTipoPersonal(datos.tipo_personal_id);
    if (!tipo || !tipo.activo) {
      throw CustomError.badRequest('El tipo de personal no existe o está inactivo', 'REFERENCIA_INVALIDA');
    }
    if (datos.especialidad_id && !(await this.personalRepository.existeEspecialidad(datos.especialidad_id))) {
      throw CustomError.badRequest('La especialidad no existe', 'REFERENCIA_INVALIDA');
    }
    if (await this.personalRepository.existeCodigoEmpleado(datos.codigo_empleado)) {
      throw CustomError.conflict('Ya existe un empleado con ese código', 'REGISTRO_DUPLICADO');
    }

    if (!email || !password) return toPersonal(await this.personalRepository.crear(datos));

    const rolCuenta = rol ?? tipo.rol_sugerido;
    if (!rolCuenta || rolCuenta === 'paciente') {
      throw CustomError.badRequest('Este tipo de personal no sugiere un rol: envía `rol` para crear la cuenta');
    }

    const perfilId = await this.supabaseAuthRepository.crearUsuario({
      email,
      password,
      nombres: datos.nombres,
      apellidos: datos.apellidos,
    });
    try {
      return toPersonal(await this.personalRepository.crear(datos, { perfilId, rol: rolCuenta }));
    } catch (error) {
      await this.authService.revertirCuenta(perfilId);
      throw error;
    }
  }
}

const toPersonal = (p: PersonalCompleto): PersonalDto => ({
  id: p.id,
  perfil_id: p.perfil_id,
  nombres: p.nombres,
  apellidos: p.apellidos,
  email: p.perfiles?.email ?? null,
  telefono: p.telefono,
  rol: p.perfiles?.rol ?? null,
  tipo: p.tipos_personal,
  especialidad: p.especialidades,
  codigo_empleado: p.codigo_empleado,
  num_licencia: p.num_licencia,
  fecha_contratacion: p.fecha_contratacion?.toISOString().slice(0, 10) ?? null,
  activo: p.activo,
});
