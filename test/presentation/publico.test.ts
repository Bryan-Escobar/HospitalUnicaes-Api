import request from 'supertest';
import { EstadoPublicoSchema } from '../../src/domain/dtos/dashboard.dto';
import { FilaEstadoPublico, PublicoRepository } from '../../src/repositories/publico.repository';
import { app } from '../helpers/app';
import { sesionComo } from '../helpers/auth';

const fila = (extra: Record<string, unknown> = {}): FilaEstadoPublico =>
  ({
    ocupacion: {
      vip: { ocupadas: 3, disponibles: 2, total: 5 },
      semiprivada: { ocupadas: 7, disponibles: 5, total: 12 },
      total: { ocupadas: 10, disponibles: 7, total: 17 },
    },
    medicos_de_turno: [
      {
        nombres: 'Roberto',
        apellidos: 'Castillo Peña',
        tipo: 'Doctor',
        especialidad: 'Medicina interna',
        area: 'Consulta externa',
        hora_inicio: '07:00:00',
        hora_fin: '15:00:00',
      },
    ],
    avisos: [
      {
        id: '3f1c2a9e-7b4d-4c1e-9f0a-2d6b8e5c1a7f',
        titulo: 'Jornada de vacunación',
        contenido: 'Este sábado de 8:00 a 12:00.',
        fecha_publicacion: '2026-11-10T14:00:00.123+00:00',
        fecha_expiracion: null,
      },
    ],
    actualizado_en: '2026-11-10T18:00:00.000001+00:00',
    ...extra,
  }) as FilaEstadoPublico;

describe('Público API', () => {
  describe('GET /api/publico/estado', () => {
    test('200 sin token, con el formato del contrato', async () => {
      jest.spyOn(PublicoRepository.prototype, 'obtenerEstado').mockResolvedValue(fila());

      const res = await request(app).get('/api/publico/estado');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(EstadoPublicoSchema.strict().safeParse(res.body.data).success).toBe(true);
      expect(res.body.data.ocupacion.total).toEqual({ ocupadas: 10, disponibles: 7, total: 17 });
      expect(res.body.data.medicos_de_turno[0]).toMatchObject({ apellidos: 'Castillo Peña', hora_inicio: '07:00:00' });
    });

    test('normaliza las fechas a ISO 8601 en UTC', async () => {
      jest.spyOn(PublicoRepository.prototype, 'obtenerEstado').mockResolvedValue(fila());

      const res = await request(app).get('/api/publico/estado');

      expect(res.body.data.avisos[0].fecha_publicacion).toBe('2026-11-10T14:00:00.123Z');
      expect(res.body.data.actualizado_en).toBe('2026-11-10T18:00:00.000Z');
    });

    test('también responde con sesión (el token se ignora)', async () => {
      jest.spyOn(PublicoRepository.prototype, 'obtenerEstado').mockResolvedValue(fila());

      const res = await request(app)
        .get('/api/publico/estado')
        .set(await sesionComo('paciente'));

      expect(res.status).toBe(200);
    });

    test('nunca deja pasar campos extra aunque la BD los devuelva', async () => {
      const conDatosPrivados = fila({ pacientes: [{ nombres: 'Carlos' }], habitaciones: ['VIP-301'] });
      conDatosPrivados.medicos_de_turno[0] = {
        ...conDatosPrivados.medicos_de_turno[0],
        telefono: '+503 7000-0002',
      } as FilaEstadoPublico['medicos_de_turno'][0];
      conDatosPrivados.ocupacion.vip = { ...conDatosPrivados.ocupacion.vip, camas: ['VIP-301-A'] } as never;
      jest.spyOn(PublicoRepository.prototype, 'obtenerEstado').mockResolvedValue(conDatosPrivados);

      const res = await request(app).get('/api/publico/estado');
      const texto = JSON.stringify(res.body);

      expect(Object.keys(res.body.data).sort()).toEqual(['actualizado_en', 'avisos', 'medicos_de_turno', 'ocupacion']);
      expect(texto).not.toMatch(/Carlos|VIP-301|telefono/);
    });

    test('500 sin detalles si la función no devuelve datos', async () => {
      jest.spyOn(PublicoRepository.prototype, 'obtenerEstado').mockResolvedValue(null);

      const res = await request(app).get('/api/publico/estado');

      expect(res.status).toBe(500);
      expect(res.body.code).toBe('ERROR_INTERNO');
    });
  });
});
