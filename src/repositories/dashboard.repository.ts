import { prisma } from '../config/prisma';

/** Fila única de la vista `v_dashboard_summary` (supabase/migrations: der_completo e inventario). */
export interface FilaResumenDashboard {
  vip_total: number;
  vip_ocupadas: number;
  semiprivada_total: number;
  semiprivada_ocupadas: number;
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
  // La vista no es un modelo de Prisma: se lee con SQL. Ya trae todos los agregados en una sola fila.
  async obtenerResumen(): Promise<FilaResumenDashboard | null> {
    const filas = await prisma.$queryRaw<FilaResumenDashboard[]>`select * from public.v_dashboard_summary`;
    return filas[0] ?? null;
  }
}
