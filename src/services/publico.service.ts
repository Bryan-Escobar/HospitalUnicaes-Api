import { EstadoPublicoSchema } from '../domain/dtos/dashboard.dto';
import { CustomError } from '../domain/errors/CustomError';
import { z } from '../lib/zod';
import { FilaEstadoPublico, PublicoRepository } from '../repositories/publico.repository';

export type EstadoPublico = z.infer<typeof EstadoPublicoSchema>;

/**
 * Información pública del hospital, sin sesión (context.md §3.4, HUNI-74): ocupación agregada (solo cantidades),
 * médicos de turno en este momento y avisos públicos vigentes. Nunca pacientes ni habitaciones.
 */
export class PublicoService {
  constructor(private readonly publicoRepository = new PublicoRepository()) {}

  async obtenerEstado(): Promise<EstadoPublico> {
    const fila = await this.publicoRepository.obtenerEstado();
    if (!fila) throw CustomError.internal('La función estado_publico no devolvió datos');
    return toEstadoPublico(fila);
  }
}

const iso = (valor: string) => new Date(valor).toISOString();

// Se copia campo por campo (nada de spread): si la función agregara algo, no se filtra a la respuesta pública.
export const toEstadoPublico = (f: FilaEstadoPublico): EstadoPublico => ({
  ocupacion: {
    vip: conteo(f.ocupacion.vip),
    semiprivada: conteo(f.ocupacion.semiprivada),
    total: conteo(f.ocupacion.total),
  },
  medicos_de_turno: f.medicos_de_turno.map((m) => ({
    nombres: m.nombres,
    apellidos: m.apellidos,
    tipo: m.tipo,
    especialidad: m.especialidad,
    area: m.area,
    hora_inicio: m.hora_inicio,
    hora_fin: m.hora_fin,
  })),
  avisos: f.avisos.map((a) => ({
    id: a.id,
    titulo: a.titulo,
    contenido: a.contenido,
    fecha_publicacion: iso(a.fecha_publicacion),
    fecha_expiracion: a.fecha_expiracion ? iso(a.fecha_expiracion) : null,
  })),
  actualizado_en: iso(f.actualizado_en),
});

const conteo = ({ ocupadas, disponibles, total }: FilaEstadoPublico['ocupacion']['total']) => ({
  ocupadas,
  disponibles,
  total,
});
