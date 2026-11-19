import { prisma } from '../config/prisma';

/** Fila única de la vista `v_dashboard_summary` (supabase/migrations: der_completo e inventario). */
export interface FilaResumenDashboard {
  vip_total: number;
  vip_ocupadas: number;
  vip_disponibles: number;
  semiprivada_total: number;
  semiprivada_ocupadas: number;
  semiprivada_disponibles: number;
  personal_de_turno: number;
  personal_de_turno_por_tipo: { tipo: string; cantidad: number }[];
  ambulancia_estado: 'disponible' | 'en_servicio' | 'en_mantenimiento' | null;
  solicitud_activa_id: string | null;
  citas_hoy: number;
  citas_hoy_por_estado: { estado: string; cantidad: number }[];
  laboratorio_pendientes: number;
  laboratorio_en_proceso: number;
  inventario_bajo_minimo: number;
  lotes_vencidos: number;
  lotes_vencen_15_dias: number;
  lotes_vencen_30_dias: number;
  generado_en: Date;
}

export class DashboardRepository {
  // La vista cuenta ocupación por hospitalización. La disponibilidad depende del estado de la cama.
  async obtenerResumen(): Promise<FilaResumenDashboard | null> {
    const filas = await prisma.$queryRaw<FilaResumenDashboard[]>`
      SELECT resumen.*, libres.*
      FROM public.v_dashboard_summary resumen
      CROSS JOIN (
        SELECT count(*) FILTER (WHERE h.tipo = 'vip')::int AS vip_disponibles,
               count(*) FILTER (WHERE h.tipo = 'semiprivada')::int AS semiprivada_disponibles
        FROM public.camas c
        JOIN public.habitaciones h ON h.id = c.habitacion_id
        WHERE h.activa AND c.estado = 'disponible'
          AND NOT EXISTS (
            SELECT 1 FROM public.hospitalizaciones hz
            WHERE hz.cama_id = c.id AND hz.fecha_alta IS NULL
          )
      ) libres`;
    return filas[0] ?? null;
  }
}
