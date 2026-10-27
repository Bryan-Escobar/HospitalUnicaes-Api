import { ResumenDashboardSchema } from '../domain/dtos/dashboard.dto';
import { CustomError } from '../domain/errors/CustomError';
import { z } from '../lib/zod';
import { DashboardRepository, FilaResumenDashboard } from '../repositories/dashboard.repository';

export type ResumenDashboard = z.infer<typeof ResumenDashboardSchema>;

export class DashboardService {
  constructor(private readonly dashboardRepository = new DashboardRepository()) {}

  async obtenerResumen(): Promise<ResumenDashboard> {
    const fila = await this.dashboardRepository.obtenerResumen();
    if (!fila) throw CustomError.internal('La vista del dashboard no devolvió datos');
    return toResumen(fila);
  }
}

const conteo = (total: number, ocupadas: number) => ({ ocupadas, disponibles: total - ocupadas, total });

export const toResumen = (f: FilaResumenDashboard): ResumenDashboard => ({
  ocupacion: {
    vip: conteo(f.vip_total, f.vip_ocupadas),
    semiprivada: conteo(f.semiprivada_total, f.semiprivada_ocupadas),
    total: conteo(f.vip_total + f.semiprivada_total, f.vip_ocupadas + f.semiprivada_ocupadas),
  },
  personal_de_turno: { total: f.personal_de_turno, por_tipo: f.personal_de_turno_por_tipo },
  // El seed siempre carga la única ambulancia; si faltara, se informa como disponible para no romper el panel.
  ambulancia: { estado: f.ambulancia_estado ?? 'disponible', solicitud_activa_id: f.solicitud_activa_id },
  citas_hoy: {
    total: f.citas_hoy,
    por_estado: f.citas_hoy_por_estado as ResumenDashboard['citas_hoy']['por_estado'],
  },
  laboratorio: { pendientes: f.laboratorio_pendientes, en_proceso: f.laboratorio_en_proceso },
  inventario_bajo_minimo: f.inventario_bajo_minimo,
  lotes_por_vencer: {
    vencidos: f.lotes_vencidos,
    en_15_dias: f.lotes_vencen_15_dias,
    en_30_dias: f.lotes_vencen_30_dias,
  },
  generado_en: f.generado_en.toISOString(),
});
