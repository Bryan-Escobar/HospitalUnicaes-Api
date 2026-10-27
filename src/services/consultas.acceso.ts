import { CustomError } from '../domain/errors/CustomError';
import { UsuarioAutenticado } from '../domain/interfaces';
import { ConsultaBase } from '../repositories/consultas.repository';
import { PacientesRepository } from '../repositories/pacientes.repository';

/**
 * Reglas de acceso al expediente (context.md §3.4, HUNI-57):
 * - leer: el médico tratante, el propio paciente y la administración;
 * - escribir (consulta, diagnósticos, recetas, exámenes): solo el doctor que registró la consulta,
 *   y solo mientras esté abierta (la base de datos también lo impide).
 * Recepción no ve información clínica (lo corta requireRole en las rutas).
 */

export const toPersona = (p: { id: string; nombres: string; apellidos: string }) => ({
  id: p.id,
  nombres: p.nombres,
  apellidos: p.apellidos,
});

/** Id de `personal` del doctor de la sesión; sin registro de personal → 403 PERFIL_INCOMPLETO. */
export const personalDelDoctor = async (
  pacientesRepository: PacientesRepository,
  usuario: UsuarioAutenticado,
): Promise<string> => {
  const personalId = await pacientesRepository.findPersonalIdDePerfil(usuario.id);
  if (!personalId) throw CustomError.fromCode('PERFIL_INCOMPLETO');
  return personalId;
};

/** 403 si quien llama no puede leer el expediente de este paciente. */
export const exigirLecturaDeExpediente = async (
  pacientesRepository: PacientesRepository,
  paciente: { id: string; perfil_id: string | null },
  usuario: UsuarioAutenticado,
): Promise<void> => {
  if (usuario.rol === 'administrador') return;
  if (usuario.rol === 'paciente') {
    if (paciente.perfil_id !== usuario.id) throw CustomError.forbidden('Solo puedes ver tu propio expediente');
    return;
  }
  if (usuario.rol === 'doctor') {
    const personalId = await personalDelDoctor(pacientesRepository, usuario);
    if (!(await pacientesRepository.esTratante(paciente.id, personalId))) {
      throw CustomError.forbidden('Solo puedes ver el expediente de los pacientes que atiendes');
    }
    return;
  }
  throw CustomError.forbidden('Tu rol no puede ver información clínica');
};

/** Solo el doctor que registró la consulta la modifica, y solo si sigue abierta. */
export const exigirAutorDeConsultaAbierta = (consulta: ConsultaBase, personalId: string): void => {
  if (consulta.doctor_id !== personalId) {
    throw CustomError.forbidden('Solo el doctor que registró la consulta puede modificarla');
  }
  if (consulta.cerrada_en) throw CustomError.fromCode('CONSULTA_CERRADA');
};
