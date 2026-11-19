import request from 'supertest';
import { ResumenDashboardSchema } from '../../src/domain/dtos/dashboard.dto';
import { ReportesSchema } from '../../src/domain/dtos/reportes.dto';
import { DashboardRepository, FilaResumenDashboard } from '../../src/repositories/dashboard.repository';
import { ReportesRepository } from '../../src/repositories/reportes.repository';
import { app } from '../helpers/app';
import { sesionComo } from '../helpers/auth';

const fila: FilaResumenDashboard = {
  vip_total: 5,
  vip_ocupadas: 3,
  vip_disponibles: 1,
  semiprivada_total: 12,
  semiprivada_ocupadas: 7,
  semiprivada_disponibles: 4,
  personal_de_turno: 4,
  personal_de_turno_por_tipo: [
    { tipo: 'Doctor', cantidad: 1 },
    { tipo: 'Enfermero/a', cantidad: 3 },
  ],
  ambulancia_estado: 'en_servicio',
  solicitud_activa_id: '99999999-0000-4000-8000-000000000001',
  citas_hoy: 6,
  citas_hoy_por_estado: [
    { estado: 'atendida', cantidad: 2 },
    { estado: 'programada', cantidad: 4 },
  ],
  laboratorio_pendientes: 5,
  laboratorio_en_proceso: 2,
  inventario_bajo_minimo: 3,
  lotes_vencidos: 1,
  lotes_vencen_15_dias: 2,
  lotes_vencen_30_dias: 4,
  generado_en: new Date('2026-10-25T15:00:00Z'),
};

describe('Dashboard API', () => {
  describe('GET /api/dashboard/reportes', () => {
    const ruta = '/api/dashboard/reportes';
    const rango = { desde: '2026-01-12', hasta: '2026-01-12' };

    test('valida el rango antes de consultar las métricas', async () => {
      const headers = await sesionComo('administrador');
      const obtener = jest.spyOn(ReportesRepository.prototype, 'obtener');
      const res = await request(app)
        .get(ruta)
        .query({ ...rango, hasta: '2026-01-11' })
        .set(headers);

      expect(res.status).toBe(400);
      expect(obtener).not.toHaveBeenCalled();
    });

    test('restringe los reportes al administrador', async () => {
      const obtener = jest.spyOn(ReportesRepository.prototype, 'obtener');
      const res = await request(app)
        .get(ruta)
        .query(rango)
        .set(await sesionComo('doctor'));

      expect(res.status).toBe(403);
      expect(obtener).not.toHaveBeenCalled();
    });

    test('entrega los agregados de un rango inclusivo de un solo día', async () => {
      const datos = {
        ocupacion: [{ planta: 2, fecha: rango.desde, ocupadas: 3 }],
        citas: [{ doctor_id: '3f1c2a9e-7b4d-4c1e-9f0a-2d6b8e5c1a7f', doctor: 'Marta Ruiz', atendidas: 2 }],
        ambulancia: [{ semana: rango.desde, servicios: 1 }],
        laboratorio: { pendiente: 0, en_proceso: 0, completado: 0 },
      };
      const obtener = jest.spyOn(ReportesRepository.prototype, 'obtener').mockResolvedValue(datos);
      const res = await request(app)
        .get(ruta)
        .query(rango)
        .set(await sesionComo('administrador'));

      expect(res.status).toBe(200);
      expect(ReportesSchema.parse(res.body.data)).toEqual(datos);
      expect(obtener).toHaveBeenCalledWith(rango);
    });
  });

  describe('GET /api/dashboard/resumen', () => {
    test('401 sin token', async () => {
      const res = await request(app).get('/api/dashboard/resumen');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_AUTENTICADO');
    });

    test('el administrador recibe todos los indicadores con el formato del contrato', async () => {
      const headers = await sesionComo('administrador');
      jest.spyOn(DashboardRepository.prototype, 'obtenerResumen').mockResolvedValue(fila);

      const res = await request(app).get('/api/dashboard/resumen').set(headers);

      expect(res.status).toBe(200);
      expect(ResumenDashboardSchema.safeParse(res.body.data).success).toBe(true);
      expect(res.body.data).toEqual({
        ocupacion: {
          vip: { ocupadas: 3, disponibles: 1, total: 5 },
          semiprivada: { ocupadas: 7, disponibles: 4, total: 12 },
          total: { ocupadas: 10, disponibles: 5, total: 17 },
        },
        personal_de_turno: { total: 4, por_tipo: fila.personal_de_turno_por_tipo },
        ambulancia: { estado: 'en_servicio', solicitud_activa_id: fila.solicitud_activa_id },
        citas_hoy: { total: 6, por_estado: fila.citas_hoy_por_estado },
        laboratorio: { pendientes: 5, en_proceso: 2 },
        inventario_bajo_minimo: 3,
        lotes_por_vencer: { vencidos: 1, en_15_dias: 2, en_30_dias: 4 },
        generado_en: '2026-10-25T15:00:00.000Z',
      });
    });

    test('con el hospital vacío devuelve ceros y listas vacías', async () => {
      const headers = await sesionComo('administrador');
      jest.spyOn(DashboardRepository.prototype, 'obtenerResumen').mockResolvedValue({
        ...fila,
        vip_ocupadas: 0,
        semiprivada_ocupadas: 0,
        vip_disponibles: 5,
        semiprivada_disponibles: 12,
        personal_de_turno: 0,
        personal_de_turno_por_tipo: [],
        ambulancia_estado: 'disponible',
        solicitud_activa_id: null,
        citas_hoy: 0,
        citas_hoy_por_estado: [],
      });

      const res = await request(app).get('/api/dashboard/resumen').set(headers);

      expect(res.status).toBe(200);
      expect(ResumenDashboardSchema.safeParse(res.body.data).success).toBe(true);
      expect(res.body.data.ocupacion.total).toEqual({ ocupadas: 0, disponibles: 17, total: 17 });
      expect(res.body.data.ambulancia).toEqual({ estado: 'disponible', solicitud_activa_id: null });
    });

    test.each(['doctor', 'recepcionista', 'paciente'] as const)('%s no ve el dashboard → 403', async (rol) => {
      const headers = await sesionComo(rol);
      const obtener = jest.spyOn(DashboardRepository.prototype, 'obtenerResumen');

      const res = await request(app).get('/api/dashboard/resumen').set(headers);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCESO_DENEGADO');
      expect(obtener).not.toHaveBeenCalled();
    });

    test('500 sin detalles internos si la vista no devuelve filas', async () => {
      const headers = await sesionComo('administrador');
      jest.spyOn(DashboardRepository.prototype, 'obtenerResumen').mockResolvedValue(null);

      const res = await request(app).get('/api/dashboard/resumen').set(headers);

      expect(res.status).toBe(500);
      expect(res.body.code).toBe('ERROR_INTERNO');
    });
  });
});
