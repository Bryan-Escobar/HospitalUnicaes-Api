import {
  ExamenCatalogoSchema,
  OrdenLaboratorioResumenSchema,
  OrdenLaboratorioSchema,
} from '../domain/dtos/laboratorio.dto';
import { CustomError } from '../domain/errors/CustomError';
import { UsuarioAutenticado } from '../domain/interfaces';
import { CrearOrdenBody } from '../domain/validators/laboratorio.validator';
import { z } from '../lib/zod';
import { ConsultasRepository } from '../repositories/consultas.repository';
import {
  ExamenCatalogo,
  LaboratorioRepository,
  OrdenCompleta,
  OrdenResumen,
} from '../repositories/laboratorio.repository';
import { PacientesRepository } from '../repositories/pacientes.repository';
import { exigirAutorDeConsultaAbierta, personalDelDoctor, toPersona } from './consultas.acceso';

type EstadoLaboratorio = 'pendiente' | 'en_proceso' | 'completado';

/**
 * Laboratorio (HUNI-57): catálogo de exámenes y solicitud de exámenes desde una consulta.
 * El resto del flujo (estados, resultados y archivos) es de HUNI-62.
 */
export class LaboratorioService {
  constructor(
    private readonly laboratorioRepository = new LaboratorioRepository(),
    private readonly consultasRepository = new ConsultasRepository(),
    private readonly pacientesRepository = new PacientesRepository(),
  ) {}

  async listarExamenes(): Promise<z.infer<typeof ExamenCatalogoSchema>[]> {
    return (await this.laboratorioRepository.listarExamenesActivos()).map(toExamen);
  }

  /** Solo el doctor que registró la consulta, y mientras esté abierta. */
  async crearOrden(body: CrearOrdenBody, usuario: UsuarioAutenticado): Promise<z.infer<typeof OrdenLaboratorioSchema>> {
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
}

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

export const toOrdenResumen = (o: OrdenResumen): z.infer<typeof OrdenLaboratorioResumenSchema> => ({
  id: o.id,
  fecha_solicitud: o.fecha_solicitud.toISOString(),
  registrado_por: toPersona(o.personal),
  prioridad: o.prioridad,
  estado: estadoDeOrden(o.orden_examenes.map((x) => x.estado)),
  total_examenes: o.orden_examenes.length,
});

export const toOrden = (o: OrdenCompleta): z.infer<typeof OrdenLaboratorioSchema> => ({
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
  examenes: o.orden_examenes.map((oe) => ({
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
          validado_por: oe.resultados_laboratorio.personal ? toPersona(oe.resultados_laboratorio.personal) : null,
          fecha_resultado: oe.resultados_laboratorio.fecha_resultado.toISOString(),
        }
      : null,
  })),
});
