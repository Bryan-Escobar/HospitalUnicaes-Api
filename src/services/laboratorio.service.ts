import {
  ArchivoFirmadoSchema,
  ExamenCatalogoSchema,
  OrdenExamenSchema,
  OrdenLaboratorioResumenSchema,
  OrdenLaboratorioSchema,
} from '../domain/dtos/laboratorio.dto';
import { CustomError } from '../domain/errors/CustomError';
import { UsuarioAutenticado } from '../domain/interfaces';
import { CrearOrdenBody, ListarOrdenesQuery, RegistrarResultadoBody } from '../domain/validators/laboratorio.validator';
import { randomUUID } from 'node:crypto';
import { logger } from '../config/logger';
import { paginacion, rangoDePagina } from '../lib/paginacion';
import { z } from '../lib/zod';
import { ConsultasRepository } from '../repositories/consultas.repository';
import {
  AccesoOrden,
  EstadoLaboratorio,
  ExamenCatalogo,
  FiltroOrdenes,
  LaboratorioRepository,
  OrdenCompleta,
  OrdenExamenCompleto,
  OrdenResumen,
} from '../repositories/laboratorio.repository';
import { PacientesRepository } from '../repositories/pacientes.repository';
import { ResultadosStorageRepository } from '../repositories/resultados-storage.repository';
import { exigirAutorDeConsultaAbierta, personalDelDoctor, toPersona } from './consultas.acceso';

type OrdenDto = z.infer<typeof OrdenLaboratorioSchema>;
type OrdenExamenDto = z.infer<typeof OrdenExamenSchema>;

/** Lo que dura la URL firmada del PDF de resultado. */
export const URL_FIRMADA_SEGUNDOS = 10 * 60;

/** Inicio del día en El Salvador (UTC-6, sin horario de verano). */
const inicioDelDia = (fecha: string) => new Date(`${fecha}T00:00:00-06:00`);
const DIA_MS = 24 * 60 * 60 * 1000;

export interface ArchivoSubido {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * Laboratorio.
 * - HUNI-57: catálogo y solicitud de exámenes (solo el doctor autor de la consulta abierta).
 * - HUNI-62: órdenes y resultados con máquina de estados pendiente → en_proceso → completado.
 *   Ven las órdenes: administración y recepción (procesa los exámenes), el médico tratante y el paciente.
 *   Inician exámenes y registran resultados: administración y recepción (context.md, HUNI-62).
 *   El archivo (PDF o imagen, HUNI-63) lo descargan solo el médico tratante, el paciente y administración (URL firmada).
 *   La base de datos también valida cada transición (TRANSICION_INVALIDA / RESULTADO_REQUERIDO).
 */
export class LaboratorioService {
  constructor(
    private readonly laboratorioRepository = new LaboratorioRepository(),
    private readonly consultasRepository = new ConsultasRepository(),
    private readonly pacientesRepository = new PacientesRepository(),
    private readonly storage = new ResultadosStorageRepository(),
  ) {}

  async listarExamenes(): Promise<z.infer<typeof ExamenCatalogoSchema>[]> {
    return (await this.laboratorioRepository.listarExamenesActivos()).map(toExamen);
  }

  /** Solo el doctor que registró la consulta, y mientras esté abierta. */
  async crearOrden(body: CrearOrdenBody, usuario: UsuarioAutenticado): Promise<OrdenDto> {
    const personalId = await personalDelDoctor(this.pacientesRepository, usuario);
    const consulta = await this.consultasRepository.findBase(body.consulta_id);
    if (!consulta) throw CustomError.fromCode('REFERENCIA_INVALIDA', 'La consulta no existe');
    exigirAutorDeConsultaAbierta(consulta, personalId);

    const examenIds = [...new Set(body.examen_ids)];
    const activos = await this.laboratorioRepository.examenesActivos(examenIds);
    if (activos.length !== examenIds.length) {
      throw CustomError.fromCode('REFERENCIA_INVALIDA', 'Uno o más exámenes no existen o están inactivos');
    }

    const orden = await this.laboratorioRepository.crearOrden(consulta.id, personalId, {
      prioridad: body.prioridad,
      indicaciones: body.indicaciones,
      examen_ids: examenIds,
    });
    return toOrden(orden);
  }

  /** Administración y recepción: todas. Doctor: las de pacientes que atiende. Paciente: las propias. */
  async listarOrdenes(query: ListarOrdenesQuery, usuario: UsuarioAutenticado) {
    const { pagina, por_pagina, estado, prioridad, paciente_id, desde, hasta } = query;
    const filtro: FiltroOrdenes = {
      estado,
      prioridad,
      pacienteId: paciente_id,
      desde: desde ? inicioDelDia(desde) : undefined,
      hastaExclusivo: hasta ? new Date(inicioDelDia(hasta).getTime() + DIA_MS) : undefined,
    };
    if (usuario.rol === 'doctor') filtro.tratadosPor = await personalDelDoctor(this.pacientesRepository, usuario);
    if (usuario.rol === 'paciente') filtro.perfilPaciente = usuario.id;

    const { skip, take } = rangoDePagina(pagina, por_pagina);
    const [items, total] = await this.laboratorioRepository.listarOrdenes(filtro, skip, take);
    return { items: items.map(toOrden), paginacion: paginacion(pagina, por_pagina, total) };
  }

  async obtenerOrden(id: string, usuario: UsuarioAutenticado): Promise<OrdenDto> {
    await this.exigirAccesoOrden(id, usuario);
    return toOrden((await this.laboratorioRepository.findOrden(id))!);
  }

  /** pendiente → en_proceso. Cualquier otro estado de origen → 422 TRANSICION_INVALIDA. */
  async iniciarExamen(ordenId: string, ordenExamenId: string): Promise<OrdenExamenDto> {
    const examen = await this.examenDeOrden(ordenId, ordenExamenId);
    if (examen.estado !== 'pendiente') {
      throw CustomError.fromCode(
        'TRANSICION_INVALIDA',
        `El examen está ${examen.estado}; solo se inicia un examen pendiente`,
      );
    }
    const iniciado = await this.laboratorioRepository.iniciarExamen(ordenExamenId);
    if (!iniciado) {
      throw CustomError.fromCode('TRANSICION_INVALIDA', 'Otro usuario ya inició este examen; actualiza la orden');
    }
    return toOrdenExamen(iniciado);
  }

  /**
   * en_proceso → completado con su resultado (valor y/o archivo PDF o imagen). Sin resultado → 422 RESULTADO_REQUERIDO.
   * El archivo va a Storage antes de guardar, en una ruta única por subida (dos peticiones simultáneas no se pisan);
   * si la base de datos falla, se borra para no dejar archivos huérfanos.
   */
  async registrarResultado(
    ordenId: string,
    ordenExamenId: string,
    body: RegistrarResultadoBody,
    archivo: ArchivoSubido | undefined,
    usuario: UsuarioAutenticado,
  ): Promise<OrdenExamenDto> {
    const validadoPor = await personalDelDoctor(this.pacientesRepository, usuario);
    const examen = await this.examenDeOrden(ordenId, ordenExamenId);
    if (examen.estado === 'pendiente') {
      throw CustomError.fromCode(
        'TRANSICION_INVALIDA',
        'El examen está pendiente; inícialo antes de registrar el resultado',
      );
    }
    if (examen.estado === 'completado') {
      throw CustomError.fromCode('TRANSICION_INVALIDA', 'El examen ya está completado; su resultado no se modifica');
    }

    const valor = body.valor?.trim() || undefined;
    if (!valor && !archivo) throw CustomError.fromCode('RESULTADO_REQUERIDO');
    const tipo = archivo ? tipoDeArchivo(archivo.buffer) : undefined;
    if (archivo && !tipo) {
      throw CustomError.fromCode(
        'SOLICITUD_INVALIDA',
        'El archivo no es un PDF ni una imagen (JPG, PNG o WebP) válida',
      );
    }

    const ruta = tipo ? `${ordenId}/${ordenExamenId}-${randomUUID()}.${tipo.extension}` : undefined;
    if (archivo && tipo && ruta) await this.storage.subirArchivo(ruta, archivo.buffer, tipo.mime);

    try {
      const completado = await this.laboratorioRepository.registrarResultado(ordenExamenId, validadoPor, {
        valor,
        unidad: body.unidad?.trim() || undefined,
        rango_referencia: body.rango_referencia?.trim() || undefined,
        observaciones: body.observaciones?.trim() || undefined,
        archivo_url: ruta,
      });
      return toOrdenExamen(completado);
    } catch (error) {
      if (ruta) {
        await this.storage
          .eliminar(ruta)
          .catch((e: unknown) => logger.warn({ err: e }, 'No se pudo borrar el archivo huérfano'));
      }
      // Dos resultados a la vez para el mismo examen: el índice único deja pasar solo el primero.
      if (esDuplicado(error)) {
        throw CustomError.fromCode('TRANSICION_INVALIDA', 'Otro usuario ya registró el resultado de este examen');
      }
      throw error;
    }
  }

  /** URL firmada (10 min) del archivo (PDF o imagen). Recepción no descarga resultados (lo corta requireRole). */
  async urlArchivo(
    ordenId: string,
    ordenExamenId: string,
    usuario: UsuarioAutenticado,
  ): Promise<z.infer<typeof ArchivoFirmadoSchema>> {
    await this.exigirAccesoOrden(ordenId, usuario);
    const examen = await this.examenDeOrden(ordenId, ordenExamenId);
    const ruta = examen.resultados_laboratorio?.archivo_url;
    if (!ruta) throw CustomError.notFound('El resultado no tiene archivo');
    const url = await this.storage.urlFirmada(ruta, URL_FIRMADA_SEGUNDOS);
    return { url, expira_en: new Date(Date.now() + URL_FIRMADA_SEGUNDOS * 1000).toISOString() };
  }

  private async exigirAccesoOrden(id: string, usuario: UsuarioAutenticado): Promise<AccesoOrden> {
    const acceso = await this.laboratorioRepository.findAcceso(id);
    if (!acceso) {
      // Un paciente no puede averiguar qué ids existen.
      if (usuario.rol === 'paciente') throw CustomError.forbidden('Solo puedes ver tus propias órdenes');
      throw CustomError.notFound('La orden no existe');
    }
    if (usuario.rol === 'administrador' || usuario.rol === 'recepcionista') return acceso;
    if (usuario.rol === 'paciente') {
      if (acceso.paciente_perfil_id !== usuario.id) throw CustomError.forbidden('Solo puedes ver tus propias órdenes');
      return acceso;
    }
    const personalId = await personalDelDoctor(this.pacientesRepository, usuario);
    if (!(await this.pacientesRepository.esTratante(acceso.paciente_id, personalId))) {
      throw CustomError.forbidden('Solo puedes ver las órdenes de los pacientes que atiendes');
    }
    return acceso;
  }

  private async examenDeOrden(ordenId: string, ordenExamenId: string): Promise<OrdenExamenCompleto> {
    const examen = await this.laboratorioRepository.findExamen(ordenId, ordenExamenId);
    if (!examen) throw CustomError.notFound('El examen no existe en esa orden');
    return examen;
  }
}

interface TipoArchivo {
  mime: string;
  extension: string;
}

/** Tipo real del archivo por sus primeros bytes (no se confía en el Content-Type que manda el cliente). */
export const tipoDeArchivo = (buffer: Buffer): TipoArchivo | undefined => {
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', extension: 'pdf' };
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', extension: 'jpg' };
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', extension: 'png' };
  }
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') {
    return { mime: 'image/webp', extension: 'webp' };
  }
  return undefined;
};

/** `pdf` o `imagen` según la extensión guardada en la ruta (null si no hay archivo). */
export const tipoArchivoDeRuta = (ruta: string | null): 'pdf' | 'imagen' | null => {
  if (!ruta) return null;
  return ruta.toLowerCase().endsWith('.pdf') ? 'pdf' : 'imagen';
};

const esDuplicado = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && 'code' in error && (error as { code: unknown }).code === 'P2002');

/** El estado de la orden sale de sus exámenes: completado cuando todos lo están. */
export const estadoDeOrden = (estados: EstadoLaboratorio[]): EstadoLaboratorio => {
  if (estados.length > 0 && estados.every((e) => e === 'completado')) return 'completado';
  if (estados.some((e) => e !== 'pendiente')) return 'en_proceso';
  return 'pendiente';
};

const toExamen = (e: ExamenCatalogo): z.infer<typeof ExamenCatalogoSchema> => ({
  id: e.id,
  nombre: e.nombre,
  categoria: e.categoria,
  tipo_muestra: e.tipo_muestra,
  tiempo_entrega_horas: e.tiempo_entrega_horas,
  activo: e.activo,
});

export const toOrdenExamen = (oe: OrdenExamenCompleto): OrdenExamenDto => ({
  id: oe.id,
  examen: oe.examenes_catalogo,
  estado: oe.estado,
  fecha_inicio: oe.fecha_inicio?.toISOString() ?? null,
  fecha_completado: oe.fecha_completado?.toISOString() ?? null,
  resultado: oe.resultados_laboratorio
    ? {
        id: oe.resultados_laboratorio.id,
        valor: oe.resultados_laboratorio.valor,
        unidad: oe.resultados_laboratorio.unidad,
        rango_referencia: oe.resultados_laboratorio.rango_referencia,
        observaciones: oe.resultados_laboratorio.observaciones,
        tiene_archivo: Boolean(oe.resultados_laboratorio.archivo_url),
        tipo_archivo: tipoArchivoDeRuta(oe.resultados_laboratorio.archivo_url),
        validado_por: oe.resultados_laboratorio.personal ? toPersona(oe.resultados_laboratorio.personal) : null,
        fecha_resultado: oe.resultados_laboratorio.fecha_resultado.toISOString(),
      }
    : null,
});

export const toOrdenResumen = (o: OrdenResumen): z.infer<typeof OrdenLaboratorioResumenSchema> => ({
  id: o.id,
  fecha_solicitud: o.fecha_solicitud.toISOString(),
  registrado_por: toPersona(o.personal),
  prioridad: o.prioridad,
  estado: estadoDeOrden(o.orden_examenes.map((x) => x.estado)),
  total_examenes: o.orden_examenes.length,
});

export const toOrden = (o: OrdenCompleta): OrdenDto => ({
  id: o.id,
  fecha_solicitud: o.fecha_solicitud.toISOString(),
  registrado_por: toPersona(o.personal),
  prioridad: o.prioridad,
  estado: estadoDeOrden(o.orden_examenes.map((x) => x.estado)),
  consulta_id: o.consulta_id,
  paciente: toPersona(o.consultas.expedientes.pacientes),
  doctor: {
    ...toPersona(o.consultas.personal),
    especialidad: o.consultas.personal.especialidades?.nombre ?? null,
  },
  indicaciones: o.indicaciones,
  examenes: o.orden_examenes.map(toOrdenExamen),
});
