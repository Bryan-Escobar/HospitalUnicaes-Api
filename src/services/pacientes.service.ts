import { PacienteSchema } from '../domain/dtos/pacientes.dto';
import { CustomError } from '../domain/errors/CustomError';
import { UsuarioAutenticado } from '../domain/interfaces';
import {
  ActualizarPacienteBody,
  CrearPacienteBody,
  ListarPacientesQuery,
} from '../domain/validators/pacientes.validator';
import { paginacion, rangoDePagina } from '../lib/paginacion';
import { z } from '../lib/zod';
import { PacienteConExpediente, PacientesRepository } from '../repositories/pacientes.repository';

export type PacienteDto = z.infer<typeof PacienteSchema>;

/**
 * Acceso a datos personales (context.md §3.4 y §6):
 * - administrador y recepcionista: todos los pacientes;
 * - doctor: solo los que atiende (cita no cancelada, consulta u hospitalización), solo lectura;
 * - paciente: solo su propia ficha (ver y editar).
 */
export class PacientesService {
  constructor(private readonly pacientesRepository = new PacientesRepository()) {}

  async listar(query: ListarPacientesQuery, usuario: UsuarioAutenticado) {
    const { pagina, por_pagina, buscar, activo = true } = query;
    const tratadosPor = usuario.rol === 'doctor' ? await this.personalDelDoctor(usuario) : undefined;
    const { skip, take } = rangoDePagina(pagina, por_pagina);
    const [items, total] = await this.pacientesRepository.listar({ buscar, activo, tratadosPor }, skip, take);
    return { items: items.map(toPaciente), paginacion: paginacion(pagina, por_pagina, total) };
  }

  async obtener(id: string, usuario: UsuarioAutenticado): Promise<PacienteDto> {
    return toPaciente(await this.buscarConAcceso(id, usuario));
  }

  async crear(body: CrearPacienteBody): Promise<PacienteDto> {
    await this.validarDocumentoLibre(body.documento_identidad);
    return toPaciente(await this.pacientesRepository.crear(body));
  }

  async actualizar(id: string, body: ActualizarPacienteBody, usuario: UsuarioAutenticado): Promise<PacienteDto> {
    if (Object.keys(body).length === 0) throw CustomError.badRequest('Envía al menos un campo para actualizar');
    if (usuario.rol === 'paciente' && body.activo !== undefined) {
      throw CustomError.forbidden('Solo administración o recepción pueden activar o desactivar pacientes');
    }
    await this.buscarConAcceso(id, usuario);
    await this.validarDocumentoLibre(body.documento_identidad, id);
    return toPaciente(await this.pacientesRepository.actualizar(id, body));
  }

  /** Desactivación lógica: conserva expediente e historial y bloquea su cuenta (si tiene). */
  async desactivar(id: string): Promise<PacienteDto> {
    if (!(await this.pacientesRepository.findById(id))) throw CustomError.notFound('El paciente no existe');
    return toPaciente(await this.pacientesRepository.actualizar(id, { activo: false }));
  }

  private async buscarConAcceso(id: string, usuario: UsuarioAutenticado): Promise<PacienteConExpediente> {
    const paciente = await this.pacientesRepository.findById(id);

    if (usuario.rol === 'paciente') {
      // No se revela si el id existe: un paciente solo puede pedir el suyo.
      if (!paciente || paciente.perfil_id !== usuario.id) {
        throw CustomError.forbidden('Solo puedes ver o editar tu propia ficha');
      }
      return paciente;
    }

    if (!paciente) throw CustomError.notFound('El paciente no existe');

    if (usuario.rol === 'doctor') {
      const personalId = await this.personalDelDoctor(usuario);
      if (!(await this.pacientesRepository.esTratante(id, personalId))) {
        throw CustomError.forbidden('Solo puedes ver a los pacientes que atiendes');
      }
    }
    return paciente;
  }

  private async personalDelDoctor(usuario: UsuarioAutenticado): Promise<string> {
    const personalId = await this.pacientesRepository.findPersonalIdDePerfil(usuario.id);
    if (!personalId) throw CustomError.fromCode('PERFIL_INCOMPLETO');
    return personalId;
  }

  private async validarDocumentoLibre(documento: string | undefined, exceptoId?: string) {
    if (documento && (await this.pacientesRepository.existeDocumento(documento, exceptoId))) {
      throw CustomError.conflict('Ya existe un paciente con ese documento de identidad', 'REGISTRO_DUPLICADO');
    }
  }
}

export const toPaciente = (p: PacienteConExpediente): PacienteDto => ({
  id: p.id,
  perfil_id: p.perfil_id,
  nombres: p.nombres,
  apellidos: p.apellidos,
  documento_identidad: p.documento_identidad,
  fecha_nacimiento: p.fecha_nacimiento?.toISOString().slice(0, 10) ?? null,
  sexo: p.sexo,
  telefono: p.telefono,
  direccion: p.direccion,
  contacto_emergencia: p.contacto_emergencia,
  telefono_emergencia: p.telefono_emergencia,
  numero_expediente: p.expedientes?.numero_expediente ?? '',
  activo: p.activo,
  created_at: p.created_at.toISOString(),
});
