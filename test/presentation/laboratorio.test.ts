import request from 'supertest';
import { ExamenCatalogoSchema, OrdenLaboratorioSchema } from '../../src/domain/dtos/laboratorio.dto';
import { ConsultasRepository } from '../../src/repositories/consultas.repository';
import { LaboratorioRepository, OrdenCompleta } from '../../src/repositories/laboratorio.repository';
import { PacientesRepository } from '../../src/repositories/pacientes.repository';
import { estadoDeOrden } from '../../src/services/laboratorio.service';
import { app } from '../helpers/app';
import { sesionComo, USUARIOS } from '../helpers/auth';

const CONSULTA_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const PERSONAL_DOCTOR = 'cccccccc-0000-4000-8000-000000000002';
const HEMOGRAMA = 'abababab-0000-4000-8000-000000000001';
const GLUCOSA = 'abababab-0000-4000-8000-000000000002';

const autor = { id: PERSONAL_DOCTOR, nombres: 'Roberto', apellidos: 'Castillo Peña' };

const orden = (): OrdenCompleta => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000031',
  consulta_id: CONSULTA_ID,
  fecha_solicitud: new Date('2026-10-26T15:30:00Z'),
  prioridad: 'urgente',
  estado: 'pendiente',
  indicaciones: 'En ayunas',
  registrado_por: PERSONAL_DOCTOR,
  personal: autor,
  consultas: {
    expedientes: {
      pacientes: { id: 'bbbbbbbb-0000-4000-8000-000000000004', nombres: 'Carlos', apellidos: 'Martínez' },
    },
    personal: { ...autor, especialidades: { nombre: 'Medicina interna' } },
  },
  orden_examenes: [HEMOGRAMA, GLUCOSA].map((examenId, i) => ({
    id: `aaaaaaaa-0000-4000-8000-00000000004${i}`,
    orden_id: 'aaaaaaaa-0000-4000-8000-000000000031',
    examen_id: examenId,
    estado: 'pendiente' as const,
    fecha_inicio: null,
    fecha_completado: null,
    examenes_catalogo: { id: examenId, nombre: i === 0 ? 'Hemograma completo' : 'Glucosa', tipo_muestra: 'Sangre' },
    resultados_laboratorio: null,
  })),
});

const consultaBase = (cambios = {}) => ({
  id: CONSULTA_ID,
  doctor_id: PERSONAL_DOCTOR,
  cerrada_en: null,
  paciente_id: 'bbbbbbbb-0000-4000-8000-000000000004',
  paciente_perfil_id: USUARIOS.paciente,
  ...cambios,
});

const lab = <K extends keyof LaboratorioRepository>(m: K) => jest.spyOn(LaboratorioRepository.prototype, m);

const comoDoctor = async (personalId = PERSONAL_DOCTOR) => {
  const headers = await sesionComo('doctor');
  jest.spyOn(PacientesRepository.prototype, 'findPersonalIdDePerfil').mockResolvedValue(personalId);
  return headers;
};

describe('Laboratorio API (HUNI-57: catálogo y solicitud de exámenes)', () => {
  describe('GET /api/laboratorio/examenes', () => {
    test.each(['administrador', 'doctor', 'recepcionista'] as const)('%s ve el catálogo activo', async (rol) => {
      const headers = await sesionComo(rol);
      lab('listarExamenesActivos').mockResolvedValue([
        {
          id: HEMOGRAMA,
          nombre: 'Hemograma completo',
          categoria: 'Hematología',
          tipo_muestra: 'Sangre venosa',
          tiempo_entrega_horas: 4,
          activo: true,
        },
      ]);

      const res = await request(app).get('/api/laboratorio/examenes').set(headers);

      expect(res.status).toBe(200);
      expect(ExamenCatalogoSchema.safeParse(res.body.data[0]).success).toBe(true);
    });

    test('paciente → 403', async () => {
      const res = await request(app)
        .get('/api/laboratorio/examenes')
        .set(await sesionComo('paciente'));

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/laboratorio/ordenes', () => {
    const body = { consulta_id: CONSULTA_ID, prioridad: 'urgente', examen_ids: [HEMOGRAMA, GLUCOSA, HEMOGRAMA] };

    test('el autor de la consulta solicita exámenes → 201 (repetidos se ignoran)', async () => {
      const headers = await comoDoctor();
      jest.spyOn(ConsultasRepository.prototype, 'findBase').mockResolvedValue(consultaBase());
      lab('examenesActivos').mockResolvedValue([HEMOGRAMA, GLUCOSA]);
      const crear = lab('crearOrden').mockResolvedValue(orden());

      const res = await request(app).post('/api/laboratorio/ordenes').set(headers).send(body);

      expect(res.status).toBe(201);
      expect(OrdenLaboratorioSchema.safeParse(res.body.data).success).toBe(true);
      expect(res.body.data).toMatchObject({ estado: 'pendiente', registrado_por: autor });
      expect(crear).toHaveBeenCalledWith(CONSULTA_ID, PERSONAL_DOCTOR, {
        prioridad: 'urgente',
        indicaciones: undefined,
        examen_ids: [HEMOGRAMA, GLUCOSA],
      });
    });

    test('un examen que no existe o está inactivo → 400 REFERENCIA_INVALIDA', async () => {
      const headers = await comoDoctor();
      jest.spyOn(ConsultasRepository.prototype, 'findBase').mockResolvedValue(consultaBase());
      lab('examenesActivos').mockResolvedValue([HEMOGRAMA]);
      const crear = lab('crearOrden');

      const res = await request(app).post('/api/laboratorio/ordenes').set(headers).send(body);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('REFERENCIA_INVALIDA');
      expect(crear).not.toHaveBeenCalled();
    });

    test('consulta que no existe → 400 REFERENCIA_INVALIDA', async () => {
      const headers = await comoDoctor();
      jest.spyOn(ConsultasRepository.prototype, 'findBase').mockResolvedValue(null);

      const res = await request(app).post('/api/laboratorio/ordenes').set(headers).send(body);

      expect(res.status).toBe(400);
    });

    test('consulta cerrada → 409 CONSULTA_CERRADA', async () => {
      const headers = await comoDoctor();
      jest.spyOn(ConsultasRepository.prototype, 'findBase').mockResolvedValue(consultaBase({ cerrada_en: new Date() }));

      const res = await request(app).post('/api/laboratorio/ordenes').set(headers).send(body);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CONSULTA_CERRADA');
    });

    test('consulta de otro doctor → 403', async () => {
      const headers = await comoDoctor('cccccccc-0000-4000-8000-000000000005');
      jest.spyOn(ConsultasRepository.prototype, 'findBase').mockResolvedValue(consultaBase());

      const res = await request(app).post('/api/laboratorio/ordenes').set(headers).send(body);

      expect(res.status).toBe(403);
    });

    test.each(['administrador', 'recepcionista', 'paciente'] as const)('%s no solicita exámenes → 403', async (rol) => {
      const res = await request(app)
        .post('/api/laboratorio/ordenes')
        .set(await sesionComo(rol))
        .send(body);

      expect(res.status).toBe(403);
    });

    test('sin exámenes → 400 VALIDACION', async () => {
      const res = await request(app)
        .post('/api/laboratorio/ordenes')
        .set(await comoDoctor())
        .send({ consulta_id: CONSULTA_ID, examen_ids: [] });

      expect(res.status).toBe(400);
    });
  });

  test.each([
    [[], 'pendiente'],
    [['pendiente', 'pendiente'], 'pendiente'],
    [['completado', 'pendiente'], 'en_proceso'],
    [['en_proceso'], 'en_proceso'],
    [['completado', 'completado'], 'completado'],
  ] as const)('el estado de la orden con exámenes %j es %s', (estados, esperado) => {
    expect(estadoDeOrden([...estados])).toBe(esperado);
  });
});
