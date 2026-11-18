import { prisma } from '../config/prisma';
import { rangoDeFechas } from '../lib/fechas';
import { Reportes, ReportesQuery } from '../domain/dtos/reportes.dto';

export class ReportesRepository {
  async obtener({ desde, hasta }: ReportesQuery): Promise<Reportes> {
    const { desde: inicio, hastaExclusivo: fin } = rangoDeFechas(desde, hasta);
    const [ocupacion, citas, ambulancia, ordenes] = await Promise.all([
      this.ocupacionDiaria(desde, hasta),
      prisma.$queryRaw<Reportes['citas']>`
        SELECT p.id AS doctor_id, concat_ws(' ', p.nombres, p.apellidos) AS doctor, count(*)::int AS atendidas
        FROM public.citas c
        JOIN public.personal p ON p.id = c.doctor_id
        WHERE c.estado = 'atendida' AND c.fecha_hora >= ${inicio} AND c.fecha_hora < ${fin}
        GROUP BY p.id
        ORDER BY atendidas DESC, doctor, p.id`,
      prisma.$queryRaw<Reportes['ambulancia']>`
        SELECT to_char(date_trunc('week', fecha_cierre AT TIME ZONE 'America/El_Salvador'), 'YYYY-MM-DD') AS semana,
               count(*)::int AS servicios
        FROM public.solicitudes_ambulancia
        WHERE estado = 'finalizada' AND fecha_cierre >= ${inicio} AND fecha_cierre < ${fin}
        GROUP BY 1
        ORDER BY 1`,
      prisma.ordenes_laboratorio.groupBy({
        by: ['estado'],
        where: { fecha_solicitud: { gte: inicio, lt: fin } },
        _count: { _all: true },
      }),
    ]);

    const laboratorio = { pendiente: 0, en_proceso: 0, completado: 0 };
    for (const { estado, _count } of ordenes) laboratorio[estado] = _count._all;
    return { ocupacion, citas, ambulancia, laboratorio };
  }

  private ocupacionDiaria(desde: string, hasta: string): Promise<Reportes['ocupacion']> {
    // Cada traslado termina un tramo y abre otro. La última cama de la hospitalización
    // solo sirve como cama inicial si no hubo traslados.
    return prisma.$queryRaw<Reportes['ocupacion']>`
      WITH dias AS (
        SELECT ${desde}::date + n AS fecha,
               LEAST(((${desde}::date + n + 1)::timestamp AT TIME ZONE 'America/El_Salvador'), now()) AS corte
        FROM generate_series(0, ${hasta}::date - ${desde}::date) AS serie(n)
      ), estancias AS (
        SELECT id, cama_id, fecha_ingreso, fecha_alta
        FROM public.hospitalizaciones
        WHERE fecha_ingreso < (SELECT max(corte) FROM dias)
          AND (fecha_alta IS NULL OR fecha_alta >= (SELECT min(corte) FROM dias))
      ), traslados AS (
        SELECT m.hospitalizacion_id, m.cama_origen_id, m.cama_destino_id, m.created_at,
               row_number() OVER orden AS numero, lead(m.created_at) OVER orden AS siguiente
        FROM public.movimientos_cama m
        JOIN estancias e ON e.id = m.hospitalizacion_id
        WHERE m.tipo = 'traslado'
        WINDOW orden AS (PARTITION BY m.hospitalizacion_id ORDER BY m.created_at, m.id)
      ), tramos AS (
        SELECT coalesce(t.cama_origen_id, e.cama_id) AS cama_id, e.fecha_ingreso AS inicio,
               least(t.created_at, e.fecha_alta) AS fin
        FROM estancias e
        LEFT JOIN traslados t ON t.hospitalizacion_id = e.id AND t.numero = 1
        UNION ALL
        SELECT t.cama_destino_id, t.created_at, least(t.siguiente, e.fecha_alta)
        FROM traslados t
        JOIN estancias e ON e.id = t.hospitalizacion_id
      ), camas_por_planta AS (
        SELECT c.id, h.planta FROM public.camas c JOIN public.habitaciones h ON h.id = c.habitacion_id
      ), ocupadas_por_dia AS (
        SELECT d.fecha, c.planta, count(DISTINCT c.id)::int AS ocupadas
        FROM dias d
        JOIN tramos t ON t.inicio < d.corte AND (t.fin IS NULL OR t.fin >= d.corte)
        JOIN camas_por_planta c ON c.id = t.cama_id
        GROUP BY d.fecha, c.planta
      )
      SELECT p.planta::int, to_char(d.fecha, 'YYYY-MM-DD') AS fecha, coalesce(o.ocupadas, 0) AS ocupadas
      FROM dias d
      CROSS JOIN (SELECT DISTINCT planta FROM camas_por_planta) p
      LEFT JOIN ocupadas_por_dia o ON o.fecha = d.fecha AND o.planta = p.planta
      ORDER BY p.planta, d.fecha`;
  }
}
