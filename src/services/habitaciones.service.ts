import {
  CamaSchema,
  HabitacionSchema,
  HospitalizacionDetalleSchema,
  HospitalizacionSchema,
} from '../domain/dtos/habitaciones.dto';
import { CustomError } from '../domain/errors/CustomError';
import { UsuarioAutenticado } from '../domain/interfaces';
import {
  AltaBody,
  CambiarEstadoCamaBody,
  CrearHospitalizacionBody,
  ListarCamasQuery,
  ListarHabitacionesQuery,
  ListarHospitalizacionesQuery,
  SugerenciaCamaQuery,
  TrasladoBody,
} from '../domain/validators/habitaciones.validator';
import { paginacion, rangoDePagina } from '../lib/paginacion';
import { z } from '../lib/zod';
import {
  CamaConHabitacion,
  FiltroHospitalizaciones,
  HabitacionConCamas,
  HabitacionesRepository,
  HospitalizacionCompleta,
  HospitalizacionDetalle,
} from '../repositories/habitaciones.repository';
import { PacientesRepository } from '../repositories/pacientes.repository';
import { personalDelDoctor, toPersona } from './consultas.acceso';

type HospitalizacionDto = z.infer<typeof HospitalizacionSchema>;
type HospitalizacionDetalleDto = z.infer<typeof HospitalizacionDetalleSchema>;

/**
 * Habitaciones y camas (HUNI-66). 3ª planta: VIP-301…305 (1 cama); 2ª planta: HAB-201…206 (2 camas).
 * - Ingresan, trasladan y dan de alta: administración y recepción. La base de datos bloquea la fila de la cama,
 *   así que dos peticiones por la misma (o la última) cama: solo una gana (CAMA_OCUPADA / SIN_CAMAS_DISPONIBLES).
 * - Ven hospitalizaciones: administración, recepción, el médico tratante y el propio paciente.
 * - En el mapa, un doctor solo ve el nombre del ocupante si es su médico tratante.
 */
export class HabitacionesService {
  constructor(
    private readonly habitacionesRepository = new HabitacionesRepository(),
    private readonly pacientesRepository = new PacientesRepository(),
  ) {}

  async mapa(query: ListarHabitacionesQuery, usuario: UsuarioAutenticado): Promise<z.infer<typeof HabitacionSchema>[]> {
    const habitaciones = await this.habitacionesRepository.listarHabitaciones(query);
    let visibles: Set<string> | null = null; // null = ve a todos los ocupantes
    if (usuario.rol === 'doctor') {
      const personalId = await personalDelDoctor(this.pacientesRepository, usuario);
      const ocupantes = habitaciones.flatMap((h) =>
        h.camas.flatMap((c) => c.hospitalizaciones.map((x) => x.pacientes.id)),
      );
      visibles = await this.habitacionesRepository.pacientesTratados(personalId, ocupantes);
    }
    return habitaciones.map((h) => toHabitacion(h, visibles));
  }

  async listarCamas(query: ListarCamasQuery): Promise<z.infer<typeof CamaSchema>[]> {
    return (await this.habitacionesRepository.listarCamas(query)).map(toCama);
  }

  /** Primero habitaciones vacías (privacidad, control de infecciones); luego cualquier cama libre del tipo. */
  async sugerir(query: SugerenciaCamaQuery): Promise<z.infer<typeof CamaSchema>> {
    const cama = await this.habitacionesRepository.sugerirCama(query.tipo);
    if (!cama) throw CustomError.fromCode('SIN_CAMAS_DISPONIBLES', `No hay camas ${query.tipo} libres`);
    return toCama(cama);
  }

  async cambiarEstadoCama(id: string, body: CambiarEstadoCamaBody): Promise<z.infer<typeof CamaSchema>> {
    const cama = await this.habitacionesRepository.findCama(id);
    if (!cama) throw CustomError.notFound('La cama no existe');
    if (cama.estado === 'ocupada') {
      throw CustomError.fromCode('CAMA_OCUPADA', 'La cama tiene un paciente; libérala con un alta o un traslado');
    }
    return toCama(await this.habitacionesRepository.cambiarEstadoCama(id, body.estado));
  }

  async ingresar(body: CrearHospitalizacionBody, usuario: UsuarioAutenticado): Promise<HospitalizacionDetalleDto> {
    const autor = await this.pacientesRepository.findPersonalIdDePerfil(usuario.id);
    const id = await this.habitacionesRepository.ingresar(body, autor);
    return this.detalle(id);
  }

  async trasladar(id: string, body: TrasladoBody, usuario: UsuarioAutenticado): Promise<HospitalizacionDetalleDto> {
    const autor = await this.pacientesRepository.findPersonalIdDePerfil(usuario.id);
    await this.habitacionesRepository.trasladar(id, body.cama_id, autor);
    return this.detalle(id);
  }

  async darAlta(id: string, body: AltaBody, usuario: UsuarioAutenticado): Promise<HospitalizacionDetalleDto> {
    const autor = await this.pacientesRepository.findPersonalIdDePerfil(usuario.id);
    await this.habitacionesRepository.darAlta(id, body.notas, autor);
    return this.detalle(id);
  }

  async listar(query: ListarHospitalizacionesQuery, usuario: UsuarioAutenticado) {
    const { pagina, por_pagina, estado, paciente_id } = query;
    const filtro: FiltroHospitalizaciones = { estado, pacienteId: paciente_id };
    if (usuario.rol === 'doctor') filtro.tratadosPor = await personalDelDoctor(this.pacientesRepository, usuario);
    if (usuario.rol === 'paciente') filtro.perfilPaciente = usuario.id;

    const { skip, take } = rangoDePagina(pagina, por_pagina);
    const [items, total] = await this.habitacionesRepository.listarHospitalizaciones(filtro, skip, take);
    return { items: items.map(toHospitalizacion), paginacion: paginacion(pagina, por_pagina, total) };
  }

  async obtener(id: string, usuario: UsuarioAutenticado): Promise<HospitalizacionDetalleDto> {
    const hosp = await this.habitacionesRepository.findHospitalizacion(id);
    if (!hosp) {
      // Un paciente no puede averiguar qué ids existen.
      if (usuario.rol === 'paciente') throw CustomError.forbidden('Solo puedes ver tu propia hospitalización');
      throw CustomError.notFound('La hospitalización no existe');
    }
    if (usuario.rol === 'paciente' && hosp.pacientes.perfil_id !== usuario.id) {
      throw CustomError.forbidden('Solo puedes ver tu propia hospitalización');
    }
    if (usuario.rol === 'doctor') {
      const personalId = await personalDelDoctor(this.pacientesRepository, usuario);
      if (!(await this.pacientesRepository.esTratante(hosp.paciente_id, personalId))) {
        throw CustomError.forbidden('Solo puedes ver las hospitalizaciones de los pacientes que atiendes');
      }
    }
    return toHospitalizacionDetalle(hosp);
  }

  private async detalle(id: string): Promise<HospitalizacionDetalleDto> {
    const hosp = await this.habitacionesRepository.findHospitalizacion(id);
    if (!hosp) throw CustomError.notFound('La hospitalización no existe');
    return toHospitalizacionDetalle(hosp);
  }
}

export const toCama = (c: CamaConHabitacion): z.infer<typeof CamaSchema> => ({
  id: c.id,
  codigo: c.codigo,
  estado: c.estado,
  habitacion: c.habitaciones,
});

const toHabitacion = (h: HabitacionConCamas, visibles: Set<string> | null): z.infer<typeof HabitacionSchema> => ({
  id: h.id,
  codigo: h.codigo,
  planta: h.planta,
  tipo: h.tipo,
  capacidad: h.capacidad,
  activa: h.activa,
  camas: h.camas.map((c) => {
    const activa = c.hospitalizaciones[0];
    const mostrar = activa && (visibles === null || visibles.has(activa.pacientes.id));
    return {
      id: c.id,
      codigo: c.codigo,
      estado: c.estado,
      ocupante: mostrar
        ? {
            hospitalizacion_id: activa.id,
            paciente: { ...toPersona(activa.pacientes), sexo: activa.pacientes.sexo },
            fecha_ingreso: activa.fecha_ingreso.toISOString(),
          }
        : null,
    };
  }),
});

const toHospitalizacion = (h: HospitalizacionCompleta): HospitalizacionDto => ({
  id: h.id,
  paciente: toPersona(h.pacientes),
  cama: { id: h.camas.id, codigo: h.camas.codigo, habitacion: h.camas.habitaciones },
  doctor_tratante: { ...toPersona(h.personal), especialidad: h.personal.especialidades?.nombre ?? null },
  fecha_ingreso: h.fecha_ingreso.toISOString(),
  fecha_alta: h.fecha_alta?.toISOString() ?? null,
  motivo_ingreso: h.motivo_ingreso,
  notas_alta: h.notas_alta,
  estado: h.estado,
});

const toHospitalizacionDetalle = (h: HospitalizacionDetalle): HospitalizacionDetalleDto => ({
  ...toHospitalizacion(h),
  movimientos: h.movimientos_cama.map((m) => ({
    tipo: m.tipo,
    cama_origen: m.camas_movimientos_cama_cama_origen_idTocamas,
    cama_destino: m.camas_movimientos_cama_cama_destino_idTocamas,
    registrado_por: m.personal ? toPersona(m.personal) : null,
    notas: m.notas,
    created_at: m.created_at.toISOString(),
  })),
});
