import { PersonalSchema } from '../domain/dtos/personal.dto';
import { CustomError } from '../domain/errors/CustomError';
import { UsuarioAutenticado } from '../domain/interfaces';
import {
  ActualizarPersonalBody,
  CrearPersonalBody,
  ListarPersonalQuery,
} from '../domain/validators/personal.validator';
import { paginacion, rangoDePagina } from '../lib/paginacion';
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

    const tipo = await this.validarTipo(datos.tipo_personal_id);
    await this.validarEspecialidad(datos.especialidad_id);
    await this.validarCodigoLibre(datos.codigo_empleado);

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

  async listar(query: ListarPersonalQuery) {
    const { pagina, por_pagina, ...filtro } = query;
    const { skip, take } = rangoDePagina(pagina, por_pagina);
    const [items, total] = await this.personalRepository.listar(filtro, skip, take);
    return { items: items.map(toPersonal), paginacion: paginacion(pagina, por_pagina, total) };
  }

  async obtener(id: string): Promise<PersonalDto> {
    return toPersonal(await this.buscar(id));
  }

  async actualizar(id: string, body: ActualizarPersonalBody, usuario: UsuarioAutenticado): Promise<PersonalDto> {
    if (Object.keys(body).length === 0) throw CustomError.badRequest('Envía al menos un campo para actualizar');
    const actual = await this.buscar(id);

    if (body.rol && !actual.perfil_id) {
      throw CustomError.badRequest('El empleado no tiene cuenta: no se le puede asignar un rol');
    }
    this.impedirAutoBloqueo(
      actual.perfil_id,
      usuario,
      body.activo === false || (!!body.rol && body.rol !== 'administrador'),
    );
    if (body.tipo_personal_id && body.tipo_personal_id !== actual.tipo_personal_id) {
      await this.validarTipo(body.tipo_personal_id);
    }
    await this.validarEspecialidad(body.especialidad_id);
    if (body.codigo_empleado) await this.validarCodigoLibre(body.codigo_empleado, id);

    return toPersonal(await this.personalRepository.actualizar(id, body));
  }

  /** Desactivación lógica: conserva turnos e historial y bloquea su cuenta (si tiene). */
  async desactivar(id: string, usuario: UsuarioAutenticado): Promise<PersonalDto> {
    const actual = await this.buscar(id);
    this.impedirAutoBloqueo(actual.perfil_id, usuario, true);
    return toPersonal(await this.personalRepository.actualizar(id, { activo: false }));
  }

  async listarEspecialidades() {
    return this.personalRepository.listarEspecialidades();
  }

  private async buscar(id: string): Promise<PersonalCompleto> {
    const personal = await this.personalRepository.findById(id);
    if (!personal) throw CustomError.notFound('El empleado no existe');
    return personal;
  }

  /** El administrador no puede desactivarse ni quitarse el rol a sí mismo (se quedaría sin acceso). */
  private impedirAutoBloqueo(perfilId: string | null, usuario: UsuarioAutenticado, bloquea: boolean) {
    if (bloquea && perfilId === usuario.id) {
      throw CustomError.unprocessable('No puedes desactivarte ni quitarte el rol de administrador a ti mismo');
    }
  }

  private async validarTipo(tipoId: string) {
    const tipo = await this.personalRepository.findTipoPersonal(tipoId);
    if (!tipo || !tipo.activo) {
      throw CustomError.badRequest('El tipo de personal no existe o está inactivo', 'REFERENCIA_INVALIDA');
    }
    return tipo;
  }

  private async validarEspecialidad(especialidadId: string | null | undefined) {
    if (especialidadId && !(await this.personalRepository.existeEspecialidad(especialidadId))) {
      throw CustomError.badRequest('La especialidad no existe', 'REFERENCIA_INVALIDA');
    }
  }

  private async validarCodigoLibre(codigo: string, exceptoId?: string) {
    if (await this.personalRepository.existeCodigoEmpleado(codigo, exceptoId)) {
      throw CustomError.conflict('Ya existe un empleado con ese código', 'REGISTRO_DUPLICADO');
    }
  }
}

export const toPersonal = (p: PersonalCompleto): PersonalDto => ({
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
