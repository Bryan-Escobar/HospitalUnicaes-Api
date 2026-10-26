import {
  ConsultaDetalleSchema,
  ConsultaSchema,
  DiagnosticoSchema,
  HistorialClinicoSchema,
  RecetaSchema,
} from '../domain/dtos/consultas.dto';
import { ExpedienteSchema } from '../domain/dtos/pacientes.dto';
import { CustomError } from '../domain/errors/CustomError';
import { UsuarioAutenticado } from '../domain/interfaces';
import {
  ActualizarConsultaBody,
  CrearConsultaBody,
  CrearDiagnosticoBody,
  CrearRecetaBody,
  ListarConsultasQuery,
} from '../domain/validators/consultas.validator';
import { ActualizarExpedienteBody } from '../domain/validators/pacientes.validator';
import { paginacion, rangoDePagina } from '../lib/paginacion';
import { z } from '../lib/zod';
import {
  ConsultaBase,
  ConsultaConRelaciones,
  ConsultaDetalle,
  ConsultasRepository,
  DiagnosticoConAutor,
  Expediente,
  RecetaConDetalles,
} from '../repositories/consultas.repository';
import { PacientesRepository } from '../repositories/pacientes.repository';
import {
  exigirAutorDeConsultaAbierta,
  exigirLecturaDeExpediente,
  personalDelDoctor,
  toPersona,
} from './consultas.acceso';
import { toOrdenResumen } from './laboratorio.service';
import { toPaciente } from './pacientes.service';

type ConsultaDto = z.infer<typeof ConsultaSchema>;
type ConsultaDetalleDto = z.infer<typeof ConsultaDetalleSchema>;

/** Inicio del día en El Salvador (UTC-6, sin horario de verano). */
const inicioDelDia = (fecha: string) => new Date(`${fecha}T00:00:00-06:00`);
const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Consultas, diagnósticos, recetas e historial clínico (HUNI-57).
 * Permisos en consultas.acceso.ts: leen el tratante, el propio paciente y la administración;
 * escribe solo el doctor que registró la consulta y mientras siga abierta.
 */
export class ConsultasService {
  constructor(
    private readonly consultasRepository = new ConsultasRepository(),
    private readonly pacientesRepository = new PacientesRepository(),
  ) {}

  /**
   * Cualquier doctor puede abrir una consulta a un paciente activo (emergencias, pacientes sin cita):
   * desde ese momento es su médico tratante. Si atiende una cita, debe ser suya, del mismo paciente y estar activa.
   */
  async crear(body: CrearConsultaBody, usuario: UsuarioAutenticado): Promise<ConsultaDto> {
    const personalId = await personalDelDoctor(this.pacientesRepository, usuario);
    const paciente = await this.consultasRepository.findPacienteConExpediente(body.paciente_id);
    if (!paciente) throw CustomError.fromCode('REFERENCIA_INVALIDA', 'El paciente no existe');
    if (!paciente.activo) throw CustomError.fromCode('REGLA_DE_NEGOCIO', 'El paciente está desactivado');
    if (!paciente.expedientes) throw CustomError.fromCode('REGLA_DE_NEGOCIO', 'El paciente no tiene expediente');

    if (body.cita_id) {
      const cita = await this.consultasRepository.findCita(body.cita_id);
      if (!cita) throw CustomError.fromCode('REFERENCIA_INVALIDA', 'La cita no existe');
      if (cita.paciente_id !== paciente.id) {
        throw CustomError.fromCode('REGLA_DE_NEGOCIO', 'La cita es de otro paciente');
      }
      if (cita.doctor_id !== personalId) throw CustomError.forbidden('La cita es de otro doctor');
      if (cita.consultas) throw CustomError.conflict('La cita ya tiene una consulta registrada', 'REGISTRO_DUPLICADO');
      if (cita.estado !== 'programada' && cita.estado !== 'confirmada') {
        throw CustomError.fromCode('TRANSICION_INVALIDA', `La cita está ${cita.estado}; no se puede atender`);
      }
    }

    const { paciente_id: _p, cita_id, ...datos } = body;
    void _p;
    return toConsulta(await this.consultasRepository.crear(paciente.expedientes.id, personalId, cita_id, datos));
  }

  /** Administrador: todas. Doctor: las que registró. Paciente: las propias. */
  async listar(query: ListarConsultasQuery, usuario: UsuarioAutenticado) {
    const { pagina, por_pagina, paciente_id, doctor_id, desde, hasta } = query;
    const filtro = {
      pacienteId: paciente_id,
      doctorId: doctor_id,
      desde: desde ? inicioDelDia(desde) : undefined,
      hastaExclusivo: hasta ? new Date(inicioDelDia(hasta).getTime() + DIA_MS) : undefined,
      perfilPaciente: undefined as string | undefined,
    };
    if (usuario.rol === 'doctor') filtro.doctorId = await personalDelDoctor(this.pacientesRepository, usuario);
    if (usuario.rol === 'paciente') filtro.perfilPaciente = usuario.id;

    const { skip, take } = rangoDePagina(pagina, por_pagina);
    const [items, total] = await this.consultasRepository.listar(filtro, skip, take);
    return { items: items.map(toConsulta), paginacion: paginacion(pagina, por_pagina, total) };
  }

  async obtener(id: string, usuario: UsuarioAutenticado): Promise<ConsultaDetalleDto> {
    const consulta = await this.consultasRepository.findBase(id);
    if (!consulta) {
      // Un paciente no puede averiguar qué ids existen.
      if (usuario.rol === 'paciente') throw CustomError.forbidden('Solo puedes ver tus propias consultas');
      throw CustomError.notFound('La consulta no existe');
    }
    await exigirLecturaDeExpediente(
      this.pacientesRepository,
      { id: consulta.paciente_id, perfil_id: consulta.paciente_perfil_id },
      usuario,
    );
    return toConsultaDetalle((await this.consultasRepository.findDetalle(id))!);
  }

  async actualizar(id: string, body: ActualizarConsultaBody, usuario: UsuarioAutenticado): Promise<ConsultaDto> {
    if (Object.keys(body).length === 0) throw CustomError.badRequest('Envía al menos un campo para actualizar');
    await this.consultaEditable(id, usuario);
    return toConsulta(await this.consultasRepository.actualizar(id, body));
  }

  async cerrar(id: string, usuario: UsuarioAutenticado): Promise<ConsultaDto> {
    await this.consultaEditable(id, usuario);
    return toConsulta(await this.consultasRepository.cerrar(id));
  }

  async agregarDiagnostico(
    id: string,
    body: CrearDiagnosticoBody,
    usuario: UsuarioAutenticado,
  ): Promise<z.infer<typeof DiagnosticoSchema>> {
    const { personalId } = await this.consultaEditable(id, usuario);
    return toDiagnostico(await this.consultasRepository.crearDiagnostico(id, personalId, body));
  }

  /** La receta no descuenta stock; `item_id` solo enlaza con el inventario si existe (HUNI-97). */
  async emitirReceta(
    id: string,
    body: CrearRecetaBody,
    usuario: UsuarioAutenticado,
  ): Promise<z.infer<typeof RecetaSchema>> {
    const { personalId } = await this.consultaEditable(id, usuario);
    const itemIds = [...new Set(body.detalles.flatMap((d) => (d.item_id ? [d.item_id] : [])))];
    if (itemIds.length > 0 && (await this.consultasRepository.contarItems(itemIds)) !== itemIds.length) {
      throw CustomError.fromCode('REFERENCIA_INVALIDA', 'Uno o más item_id no existen en el inventario');
    }
    return toReceta(await this.consultasRepository.crearReceta(id, personalId, body));
  }

  async historial(pacienteId: string, usuario: UsuarioAutenticado): Promise<z.infer<typeof HistorialClinicoSchema>> {
    const paciente = await this.pacienteVisible(pacienteId, usuario);
    const [expediente, consultas] = await Promise.all([
      this.consultasRepository.findExpediente(pacienteId),
      this.consultasRepository.historial(pacienteId),
    ]);
    if (!expediente) throw CustomError.fromCode('REGLA_DE_NEGOCIO', 'El paciente no tiene expediente');
    return {
      paciente: toPaciente(paciente),
      expediente: toExpediente(expediente),
      consultas: consultas.map(toConsultaDetalle),
    };
  }

  /** Solo el médico tratante actualiza tipo de sangre, alergias, antecedentes y enfermedades crónicas. */
  async actualizarExpediente(
    pacienteId: string,
    body: ActualizarExpedienteBody,
    usuario: UsuarioAutenticado,
  ): Promise<z.infer<typeof ExpedienteSchema>> {
    if (Object.keys(body).length === 0) throw CustomError.badRequest('Envía al menos un campo para actualizar');
    await this.pacienteVisible(pacienteId, usuario);
    if (!(await this.consultasRepository.findExpediente(pacienteId))) {
      throw CustomError.fromCode('REGLA_DE_NEGOCIO', 'El paciente no tiene expediente');
    }
    return toExpediente(await this.consultasRepository.actualizarExpediente(pacienteId, body));
  }

  private async pacienteVisible(pacienteId: string, usuario: UsuarioAutenticado) {
    const paciente = await this.pacientesRepository.findById(pacienteId);
    if (!paciente) {
      if (usuario.rol === 'paciente') throw CustomError.forbidden('Solo puedes ver tu propio expediente');
      throw CustomError.notFound('El paciente no existe');
    }
    await exigirLecturaDeExpediente(this.pacientesRepository, paciente, usuario);
    return paciente;
  }

  private async consultaEditable(
    id: string,
    usuario: UsuarioAutenticado,
  ): Promise<{ consulta: ConsultaBase; personalId: string }> {
    const personalId = await personalDelDoctor(this.pacientesRepository, usuario);
    const consulta = await this.consultasRepository.findBase(id);
    if (!consulta) throw CustomError.notFound('La consulta no existe');
    exigirAutorDeConsultaAbierta(consulta, personalId);
    return { consulta, personalId };
  }
}

const toDoctor = (d: ConsultaConRelaciones['personal']) => ({
  ...toPersona(d),
  especialidad: d.especialidades?.nombre ?? null,
});

export const toConsulta = (c: ConsultaConRelaciones): ConsultaDto => ({
  id: c.id,
  expediente_id: c.expediente_id,
  paciente: toPersona(c.expedientes.pacientes),
  doctor: toDoctor(c.personal),
  cita_id: c.cita_id,
  fecha: c.fecha.toISOString(),
  motivo_consulta: c.motivo_consulta,
  signos_vitales: (c.signos_vitales as ConsultaDto['signos_vitales']) ?? null,
  examen_fisico: c.examen_fisico,
  notas: c.notas,
  cerrada_en: c.cerrada_en?.toISOString() ?? null,
});

export const toDiagnostico = (d: DiagnosticoConAutor): z.infer<typeof DiagnosticoSchema> => ({
  id: d.id,
  consulta_id: d.consulta_id,
  codigo_cie10: d.codigo_cie10,
  descripcion: d.descripcion,
  tipo: d.tipo,
  registrado_por: toPersona(d.personal),
  created_at: d.created_at.toISOString(),
});

export const toReceta = (r: RecetaConDetalles): z.infer<typeof RecetaSchema> => ({
  id: r.id,
  consulta_id: r.consulta_id,
  fecha_emision: r.fecha_emision.toISOString(),
  registrado_por: toPersona(r.personal),
  indicaciones: r.indicaciones,
  detalles: r.receta_detalles.map((d) => ({
    id: d.id,
    medicamento: d.medicamento,
    dosis: d.dosis,
    frecuencia: d.frecuencia,
    duracion: d.duracion,
    cantidad: d.cantidad,
    item_id: d.item_id,
  })),
});

const toConsultaDetalle = (c: ConsultaDetalle): ConsultaDetalleDto => ({
  ...toConsulta(c),
  diagnosticos: c.diagnosticos.map(toDiagnostico),
  recetas: c.recetas.map(toReceta),
  ordenes_laboratorio: c.ordenes_laboratorio.map(toOrdenResumen),
});

const toExpediente = (e: Expediente): z.infer<typeof ExpedienteSchema> => ({
  id: e.id,
  paciente_id: e.paciente_id,
  numero_expediente: e.numero_expediente,
  tipo_sangre: e.tipo_sangre,
  alergias: e.alergias,
  antecedentes: e.antecedentes,
  enfermedades_cronicas: e.enfermedades_cronicas,
  created_at: e.created_at.toISOString(),
  updated_at: e.updated_at.toISOString(),
});
