import request from 'supertest';
import {
  ConsultaDetalleSchema,
  ConsultaSchema,
  DiagnosticoSchema,
  HistorialClinicoSchema,
  RecetaSchema,
} from '../../src/domain/dtos/consultas.dto';
import { ExpedienteSchema } from '../../src/domain/dtos/pacientes.dto';
import {
  ConsultaBase,
  ConsultaConRelaciones,
  ConsultaDetalle,
  ConsultasRepository,
  DiagnosticoConAutor,
  Expediente,
  RecetaConDetalles,
} from '../../src/repositories/consultas.repository';
import { PacienteConExpediente, PacientesRepository } from '../../src/repositories/pacientes.repository';
import { app } from '../helpers/app';
import { sesionComo, USUARIOS } from '../helpers/auth';

const CONSULTA_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const PACIENTE_ID = 'bbbbbbbb-0000-4000-8000-000000000004';
const EXPEDIENTE_ID = 'eeeeeeee-0000-4000-8000-000000000004';
const PERSONAL_DOCTOR = 'cccccccc-0000-4000-8000-000000000002';
const OTRO_DOCTOR = 'cccccccc-0000-4000-8000-000000000005';
const CITA_ID = 'dddddddd-0000-4000-8000-000000000001';
const ITEM_ID = 'ffffffff-0000-4000-8000-000000000001';

const autor = { id: PERSONAL_DOCTOR, nombres: 'Roberto', apellidos: 'Castillo Peña' };

const consulta = (cambios: Partial<ConsultaConRelaciones> = {}): ConsultaConRelaciones => ({
  id: CONSULTA_ID,
  expediente_id: EXPEDIENTE_ID,
  cita_id: null,
  doctor_id: PERSONAL_DOCTOR,
  fecha: new Date('2026-10-26T15:00:00Z'),
  motivo_consulta: 'Dolor abdominal',
  signos_vitales: { presion_arterial: '120/80', temperatura: 36.8 },
  examen_fisico: null,
  notas: null,
  cerrada_en: null,
  expedientes: {
    paciente_id: PACIENTE_ID,
    pacientes: { id: PACIENTE_ID, nombres: 'Carlos', apellidos: 'Martínez Rivas' },
  },
  personal: { ...autor, especialidades: { nombre: 'Medicina interna' } },
  ...cambios,
});

const diagnostico = (): DiagnosticoConAutor => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000011',
  consulta_id: CONSULTA_ID,
  codigo_cie10: 'K29.7',
  descripcion: 'Gastritis',
  tipo: 'principal',
  registrado_por: PERSONAL_DOCTOR,
  created_at: new Date('2026-10-26T15:10:00Z'),
  personal: autor,
});

const receta = (itemId: string | null = null): RecetaConDetalles => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000021',
  consulta_id: CONSULTA_ID,
  fecha_emision: new Date('2026-10-26T15:20:00Z'),
  indicaciones: 'Después de comer',
  registrado_por: PERSONAL_DOCTOR,
  personal: autor,
  receta_detalles: [
    {
      id: 'aaaaaaaa-0000-4000-8000-000000000022',
      receta_id: 'aaaaaaaa-0000-4000-8000-000000000021',
      item_id: itemId,
      medicamento: 'Omeprazol 20 mg',
      dosis: '1 cápsula',
      frecuencia: 'Cada 24 horas',
      duracion: '14 días',
      cantidad: 14,
    },
  ],
});

const detalle = (): ConsultaDetalle => ({
  ...consulta(),
  diagnosticos: [diagnostico()],
  recetas: [receta()],
  ordenes_laboratorio: [
    {
      id: 'aaaaaaaa-0000-4000-8000-000000000031',
      consulta_id: CONSULTA_ID,
      fecha_solicitud: new Date('2026-10-26T15:30:00Z'),
      prioridad: 'normal',
      estado: 'pendiente',
      indicaciones: null,
      registrado_por: PERSONAL_DOCTOR,
      personal: autor,
      orden_examenes: [{ estado: 'completado' }, { estado: 'pendiente' }],
    },
  ],
});

const base = (cambios: Partial<ConsultaBase> = {}): ConsultaBase => ({
  id: CONSULTA_ID,
  doctor_id: PERSONAL_DOCTOR,
  cerrada_en: null,
  paciente_id: PACIENTE_ID,
  paciente_perfil_id: USUARIOS.paciente,
  ...cambios,
});

const expediente = (): Expediente => ({
  id: EXPEDIENTE_ID,
  paciente_id: PACIENTE_ID,
  numero_expediente: 'EXP-2026-00001',
  tipo_sangre: 'O+',
  alergias: 'Penicilina',
  antecedentes: null,
  enfermedades_cronicas: null,
  created_at: new Date('2026-10-24T12:00:00Z'),
  updated_at: new Date('2026-10-26T12:00:00Z'),
});

const paciente = (): PacienteConExpediente => ({
  id: PACIENTE_ID,
  perfil_id: USUARIOS.paciente,
  nombres: 'Carlos',
  apellidos: 'Martínez Rivas',
  documento_identidad: '01234567-8',
  fecha_nacimiento: new Date('1990-05-14T00:00:00Z'),
  sexo: 'masculino',
  telefono: null,
  direccion: null,
  contacto_emergencia: null,
  telefono_emergencia: null,
  created_at: new Date('2026-10-24T12:00:00Z'),
  activo: true,
  expedientes: { numero_expediente: 'EXP-2026-00001' },
});

const repo = <K extends keyof ConsultasRepository>(m: K) => jest.spyOn(ConsultasRepository.prototype, m);
const pacientes = <K extends keyof PacientesRepository>(m: K) => jest.spyOn(PacientesRepository.prototype, m);

/** Sesión de doctor con su registro de personal. */
const comoDoctor = async (personalId = PERSONAL_DOCTOR) => {
  const headers = await sesionComo('doctor');
  pacientes('findPersonalIdDePerfil').mockResolvedValue(personalId);
  return headers;
};

const pacienteActivo = () =>
  repo('findPacienteConExpediente').mockResolvedValue({
    id: PACIENTE_ID,
    activo: true,
    perfil_id: USUARIOS.paciente,
    expedientes: { id: EXPEDIENTE_ID },
  });

describe('Consultas API', () => {
  describe('Autenticación', () => {
    test.each([
      ['post', '/api/consultas'],
      ['get', '/api/consultas'],
      ['get', `/api/consultas/${CONSULTA_ID}`],
      ['patch', `/api/consultas/${CONSULTA_ID}`],
      ['post', `/api/consultas/${CONSULTA_ID}/diagnosticos`],
      ['post', `/api/consultas/${CONSULTA_ID}/recetas`],
      ['post', `/api/consultas/${CONSULTA_ID}/cerrar`],
      ['get', `/api/pacientes/${PACIENTE_ID}/historial`],
      ['patch', `/api/pacientes/${PACIENTE_ID}/expediente`],
    ] as const)('%s %s sin token → 401', async (method, url) => {
      const res = await request(app)[method](url).send({});

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_AUTENTICADO');
    });
  });

  describe('Recepción no ve información clínica', () => {
    test.each([
      ['get', '/api/consultas'],
      ['get', `/api/consultas/${CONSULTA_ID}`],
      ['get', `/api/pacientes/${PACIENTE_ID}/historial`],
      ['post', '/api/consultas'],
    ] as const)('recepcionista %s %s → 403', async (method, url) => {
      const headers = await sesionComo('recepcionista');

      const res = await request(app)[method](url).set(headers).send({});

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCESO_DENEGADO');
    });
  });

  describe('POST /api/consultas', () => {
    const body = {
      paciente_id: PACIENTE_ID,
      motivo_consulta: 'Dolor abdominal',
      signos_vitales: { temperatura: 36.8 },
    };

    test('un doctor registra la consulta → 201 y queda como su autor', async () => {
      const headers = await comoDoctor();
      pacienteActivo();
      const crear = repo('crear').mockResolvedValue(consulta());

      const res = await request(app).post('/api/consultas').set(headers).send(body);

      expect(res.status).toBe(201);
      expect(ConsultaSchema.safeParse(res.body.data).success).toBe(true);
      expect(res.body.data.doctor).toMatchObject({ id: PERSONAL_DOCTOR, especialidad: 'Medicina interna' });
      expect(crear).toHaveBeenCalledWith(EXPEDIENTE_ID, PERSONAL_DOCTOR, undefined, {
        motivo_consulta: 'Dolor abdominal',
        signos_vitales: { temperatura: 36.8 },
      });
    });

    test.each(['administrador', 'paciente'] as const)('%s no registra consultas → 403', async (rol) => {
      const headers = await sesionComo(rol);

      const res = await request(app).post('/api/consultas').set(headers).send(body);

      expect(res.status).toBe(403);
    });

    test('paciente que no existe → 400 REFERENCIA_INVALIDA', async () => {
      const headers = await comoDoctor();
      repo('findPacienteConExpediente').mockResolvedValue(null);

      const res = await request(app).post('/api/consultas').set(headers).send(body);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('REFERENCIA_INVALIDA');
    });

    test('paciente desactivado → 422 REGLA_DE_NEGOCIO', async () => {
      const headers = await comoDoctor();
      repo('findPacienteConExpediente').mockResolvedValue({
        id: PACIENTE_ID,
        activo: false,
        perfil_id: null,
        expedientes: { id: EXPEDIENTE_ID },
      });

      const res = await request(app).post('/api/consultas').set(headers).send(body);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('REGLA_DE_NEGOCIO');
    });

    test('sin paciente_id → 400 VALIDACION', async () => {
      const headers = await comoDoctor();

      const res = await request(app).post('/api/consultas').set(headers).send({ motivo_consulta: 'x' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION');
    });

    test('doctor sin registro de personal → 403 PERFIL_INCOMPLETO', async () => {
      const headers = await sesionComo('doctor');
      pacientes('findPersonalIdDePerfil').mockResolvedValue(null);

      const res = await request(app).post('/api/consultas').set(headers).send(body);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERFIL_INCOMPLETO');
    });

    describe('atendiendo una cita', () => {
      const cita = (cambios = {}) => ({
        id: CITA_ID,
        paciente_id: PACIENTE_ID,
        doctor_id: PERSONAL_DOCTOR,
        estado: 'confirmada' as const,
        consultas: null,
        ...cambios,
      });

      test('su propia cita → 201 y se envía la cita para marcarla atendida', async () => {
        const headers = await comoDoctor();
        pacienteActivo();
        repo('findCita').mockResolvedValue(cita());
        const crear = repo('crear').mockResolvedValue(consulta({ cita_id: CITA_ID }));

        const res = await request(app)
          .post('/api/consultas')
          .set(headers)
          .send({ ...body, cita_id: CITA_ID });

        expect(res.status).toBe(201);
        expect(crear.mock.calls[0][2]).toBe(CITA_ID);
      });

      test.each([
        ['no existe', null, 400, 'REFERENCIA_INVALIDA'],
        ['es de otro paciente', { paciente_id: 'bbbbbbbb-0000-4000-8000-000000000099' }, 422, 'REGLA_DE_NEGOCIO'],
        ['es de otro doctor', { doctor_id: OTRO_DOCTOR }, 403, 'ACCESO_DENEGADO'],
        ['ya tiene consulta', { consultas: { id: CONSULTA_ID } }, 409, 'REGISTRO_DUPLICADO'],
        ['está cancelada', { estado: 'cancelada' }, 422, 'TRANSICION_INVALIDA'],
      ])('la cita %s → %s %s', async (_caso, cambios, status, code) => {
        const headers = await comoDoctor();
        pacienteActivo();
        repo('findCita').mockResolvedValue(cambios === null ? null : cita(cambios));
        const crear = repo('crear');

        const res = await request(app)
          .post('/api/consultas')
          .set(headers)
          .send({ ...body, cita_id: CITA_ID });

        expect(res.status).toBe(status);
        expect(res.body.code).toBe(code);
        expect(crear).not.toHaveBeenCalled();
      });
    });
  });

  describe('GET /api/consultas', () => {
    test('administrador ve todas y filtra por paciente y fechas (hora de El Salvador)', async () => {
      const headers = await sesionComo('administrador');
      const listar = repo('listar').mockResolvedValue([[consulta()], 1]);

      const res = await request(app)
        .get(`/api/consultas?paciente_id=${PACIENTE_ID}&desde=2026-10-01&hasta=2026-10-31`)
        .set(headers);

      expect(res.status).toBe(200);
      expect(ConsultaSchema.safeParse(res.body.data.items[0]).success).toBe(true);
      expect(listar.mock.calls[0][0]).toMatchObject({
        pacienteId: PACIENTE_ID,
        desde: new Date('2026-10-01T06:00:00Z'),
        hastaExclusivo: new Date('2026-11-01T06:00:00Z'),
      });
    });

    test('un doctor solo ve las que registró (aunque pida otro doctor)', async () => {
      const headers = await comoDoctor();
      const listar = repo('listar').mockResolvedValue([[], 0]);

      const res = await request(app).get(`/api/consultas?doctor_id=${OTRO_DOCTOR}`).set(headers);

      expect(res.status).toBe(200);
      expect(listar.mock.calls[0][0]).toMatchObject({ doctorId: PERSONAL_DOCTOR });
    });

    test('un paciente solo ve las propias', async () => {
      const headers = await sesionComo('paciente');
      const listar = repo('listar').mockResolvedValue([[], 0]);

      const res = await request(app).get('/api/consultas').set(headers);

      expect(res.status).toBe(200);
      expect(listar.mock.calls[0][0]).toMatchObject({ perfilPaciente: USUARIOS.paciente });
    });
  });

  describe('GET /api/consultas/:id', () => {
    test('administrador ve el detalle con diagnósticos, recetas y laboratorio', async () => {
      const headers = await sesionComo('administrador');
      repo('findBase').mockResolvedValue(base());
      repo('findDetalle').mockResolvedValue(detalle());

      const res = await request(app).get(`/api/consultas/${CONSULTA_ID}`).set(headers);

      expect(res.status).toBe(200);
      expect(ConsultaDetalleSchema.safeParse(res.body.data).success).toBe(true);
      expect(res.body.data.diagnosticos[0].registrado_por).toEqual(autor);
      expect(res.body.data.ordenes_laboratorio[0]).toMatchObject({ estado: 'en_proceso', total_examenes: 2 });
    });

    test('el médico tratante la ve', async () => {
      const headers = await comoDoctor(OTRO_DOCTOR);
      repo('findBase').mockResolvedValue(base());
      const esTratante = pacientes('esTratante').mockResolvedValue(true);
      repo('findDetalle').mockResolvedValue(detalle());

      const res = await request(app).get(`/api/consultas/${CONSULTA_ID}`).set(headers);

      expect(res.status).toBe(200);
      expect(esTratante).toHaveBeenCalledWith(PACIENTE_ID, OTRO_DOCTOR);
    });

    test('un doctor que no atiende al paciente → 403', async () => {
      const headers = await comoDoctor(OTRO_DOCTOR);
      repo('findBase').mockResolvedValue(base());
      pacientes('esTratante').mockResolvedValue(false);
      const findDetalle = repo('findDetalle');

      const res = await request(app).get(`/api/consultas/${CONSULTA_ID}`).set(headers);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCESO_DENEGADO');
      expect(findDetalle).not.toHaveBeenCalled();
    });

    test('el paciente ve la suya', async () => {
      const headers = await sesionComo('paciente');
      repo('findBase').mockResolvedValue(base());
      repo('findDetalle').mockResolvedValue(detalle());

      const res = await request(app).get(`/api/consultas/${CONSULTA_ID}`).set(headers);

      expect(res.status).toBe(200);
    });

    test('un paciente no ve la de otro → 403', async () => {
      const headers = await sesionComo('paciente');
      repo('findBase').mockResolvedValue(base({ paciente_perfil_id: '11111111-1111-4111-8111-000000000007' }));

      const res = await request(app).get(`/api/consultas/${CONSULTA_ID}`).set(headers);

      expect(res.status).toBe(403);
    });

    test('no existe → 404 (para un paciente, 403 sin revelar si existe)', async () => {
      repo('findBase').mockResolvedValue(null);

      const admin = await request(app)
        .get(`/api/consultas/${CONSULTA_ID}`)
        .set(await sesionComo('administrador'));
      const pac = await request(app)
        .get(`/api/consultas/${CONSULTA_ID}`)
        .set(await sesionComo('paciente'));

      expect(admin.status).toBe(404);
      expect(pac.status).toBe(403);
    });
  });

  describe('PATCH /api/consultas/:id y POST /:id/cerrar', () => {
    test('el autor la edita mientras está abierta', async () => {
      const headers = await comoDoctor();
      repo('findBase').mockResolvedValue(base());
      const actualizar = repo('actualizar').mockResolvedValue(consulta({ notas: 'Mejoría' }));

      const res = await request(app).patch(`/api/consultas/${CONSULTA_ID}`).set(headers).send({ notas: 'Mejoría' });

      expect(res.status).toBe(200);
      expect(actualizar).toHaveBeenCalledWith(CONSULTA_ID, { notas: 'Mejoría' });
    });

    test('otro doctor → 403', async () => {
      const headers = await comoDoctor(OTRO_DOCTOR);
      repo('findBase').mockResolvedValue(base());

      const res = await request(app).patch(`/api/consultas/${CONSULTA_ID}`).set(headers).send({ notas: 'x' });

      expect(res.status).toBe(403);
    });

    test('cerrada → 409 CONSULTA_CERRADA', async () => {
      const headers = await comoDoctor();
      repo('findBase').mockResolvedValue(base({ cerrada_en: new Date() }));

      const res = await request(app).patch(`/api/consultas/${CONSULTA_ID}`).set(headers).send({ notas: 'x' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CONSULTA_CERRADA');
    });

    test('sin cambios → 400', async () => {
      const headers = await comoDoctor();

      const res = await request(app).patch(`/api/consultas/${CONSULTA_ID}`).set(headers).send({});

      expect(res.status).toBe(400);
    });

    test('el autor la cierra → 200 con cerrada_en', async () => {
      const headers = await comoDoctor();
      repo('findBase').mockResolvedValue(base());
      repo('cerrar').mockResolvedValue(consulta({ cerrada_en: new Date('2026-10-26T16:00:00Z') }));

      const res = await request(app).post(`/api/consultas/${CONSULTA_ID}/cerrar`).set(headers);

      expect(res.status).toBe(200);
      expect(res.body.data.cerrada_en).toBe('2026-10-26T16:00:00.000Z');
    });

    test('cerrar una consulta ya cerrada → 409', async () => {
      const headers = await comoDoctor();
      repo('findBase').mockResolvedValue(base({ cerrada_en: new Date() }));

      const res = await request(app).post(`/api/consultas/${CONSULTA_ID}/cerrar`).set(headers);

      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/consultas/:id/diagnosticos', () => {
    test('el autor agrega un diagnóstico → 201 con autor y fecha', async () => {
      const headers = await comoDoctor();
      repo('findBase').mockResolvedValue(base());
      const crear = repo('crearDiagnostico').mockResolvedValue(diagnostico());

      const res = await request(app)
        .post(`/api/consultas/${CONSULTA_ID}/diagnosticos`)
        .set(headers)
        .send({ codigo_cie10: 'K29.7', descripcion: 'Gastritis' });

      expect(res.status).toBe(201);
      expect(DiagnosticoSchema.safeParse(res.body.data).success).toBe(true);
      expect(res.body.data).toMatchObject({ registrado_por: autor, created_at: '2026-10-26T15:10:00.000Z' });
      expect(crear).toHaveBeenCalledWith(CONSULTA_ID, PERSONAL_DOCTOR, {
        codigo_cie10: 'K29.7',
        descripcion: 'Gastritis',
        tipo: 'principal',
      });
    });

    test('si la BD rechaza por consulta cerrada (carrera con el cierre) → 409 CONSULTA_CERRADA', async () => {
      const headers = await comoDoctor();
      repo('findBase').mockResolvedValue(base());
      repo('crearDiagnostico').mockRejectedValue(new Error('CONSULTA_CERRADA: la consulta ya está cerrada'));

      const res = await request(app)
        .post(`/api/consultas/${CONSULTA_ID}/diagnosticos`)
        .set(headers)
        .send({ descripcion: 'Gastritis' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CONSULTA_CERRADA');
    });

    test('código CIE-10 inválido → 400 VALIDACION', async () => {
      const headers = await comoDoctor();

      const res = await request(app)
        .post(`/api/consultas/${CONSULTA_ID}/diagnosticos`)
        .set(headers)
        .send({ codigo_cie10: 'gastritis', descripcion: 'x' });

      expect(res.status).toBe(400);
    });

    test('paciente → 403', async () => {
      const headers = await sesionComo('paciente');

      const res = await request(app)
        .post(`/api/consultas/${CONSULTA_ID}/diagnosticos`)
        .set(headers)
        .send({ descripcion: 'x' });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/consultas/:id/recetas', () => {
    const body = (itemId?: string) => ({
      indicaciones: 'Después de comer',
      detalles: [{ medicamento: 'Omeprazol 20 mg', cantidad: 14, ...(itemId ? { item_id: itemId } : {}) }],
    });

    test('el autor emite la receta → 201 con autor', async () => {
      const headers = await comoDoctor();
      repo('findBase').mockResolvedValue(base());
      repo('crearReceta').mockResolvedValue(receta());

      const res = await request(app).post(`/api/consultas/${CONSULTA_ID}/recetas`).set(headers).send(body());

      expect(res.status).toBe(201);
      expect(RecetaSchema.safeParse(res.body.data).success).toBe(true);
      expect(res.body.data.registrado_por).toEqual(autor);
    });

    test('item_id del inventario es solo una referencia: se valida que exista y no se descuenta stock', async () => {
      const headers = await comoDoctor();
      repo('findBase').mockResolvedValue(base());
      const contar = repo('contarItems').mockResolvedValue(1);
      const crear = repo('crearReceta').mockResolvedValue(receta(ITEM_ID));

      const res = await request(app).post(`/api/consultas/${CONSULTA_ID}/recetas`).set(headers).send(body(ITEM_ID));

      expect(res.status).toBe(201);
      expect(contar).toHaveBeenCalledWith([ITEM_ID]);
      expect(crear.mock.calls[0][2].detalles[0]).toMatchObject({ item_id: ITEM_ID, cantidad: 14 });
      expect(res.body.data.detalles[0].item_id).toBe(ITEM_ID);
    });

    test('item_id que no existe → 400 REFERENCIA_INVALIDA', async () => {
      const headers = await comoDoctor();
      repo('findBase').mockResolvedValue(base());
      repo('contarItems').mockResolvedValue(0);
      const crear = repo('crearReceta');

      const res = await request(app).post(`/api/consultas/${CONSULTA_ID}/recetas`).set(headers).send(body(ITEM_ID));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('REFERENCIA_INVALIDA');
      expect(crear).not.toHaveBeenCalled();
    });

    test('sin medicamentos → 400 VALIDACION', async () => {
      const headers = await comoDoctor();

      const res = await request(app).post(`/api/consultas/${CONSULTA_ID}/recetas`).set(headers).send({ detalles: [] });

      expect(res.status).toBe(400);
    });

    test('consulta cerrada → 409', async () => {
      const headers = await comoDoctor();
      repo('findBase').mockResolvedValue(base({ cerrada_en: new Date() }));

      const res = await request(app).post(`/api/consultas/${CONSULTA_ID}/recetas`).set(headers).send(body());

      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/pacientes/:id/historial', () => {
    const mockHistorial = () => {
      pacientes('findById').mockResolvedValue(paciente());
      repo('findExpediente').mockResolvedValue(expediente());
      repo('historial').mockResolvedValue([detalle()]);
    };

    test('administrador ve el historial completo', async () => {
      const headers = await sesionComo('administrador');
      mockHistorial();

      const res = await request(app).get(`/api/pacientes/${PACIENTE_ID}/historial`).set(headers);

      expect(res.status).toBe(200);
      expect(HistorialClinicoSchema.safeParse(res.body.data).success).toBe(true);
      expect(res.body.data.consultas).toHaveLength(1);
    });

    test('el paciente ve el suyo', async () => {
      const headers = await sesionComo('paciente');
      mockHistorial();

      const res = await request(app).get(`/api/pacientes/${PACIENTE_ID}/historial`).set(headers);

      expect(res.status).toBe(200);
    });

    test('el médico tratante lo ve', async () => {
      const headers = await comoDoctor();
      mockHistorial();
      pacientes('esTratante').mockResolvedValue(true);

      const res = await request(app).get(`/api/pacientes/${PACIENTE_ID}/historial`).set(headers);

      expect(res.status).toBe(200);
    });

    test('un doctor que no lo atiende → 403', async () => {
      const headers = await comoDoctor(OTRO_DOCTOR);
      pacientes('findById').mockResolvedValue(paciente());
      pacientes('esTratante').mockResolvedValue(false);
      const historial = repo('historial');

      const res = await request(app).get(`/api/pacientes/${PACIENTE_ID}/historial`).set(headers);

      expect(res.status).toBe(403);
      expect(historial).not.toHaveBeenCalled();
    });

    test('otro paciente → 403', async () => {
      const headers = await sesionComo('paciente');
      pacientes('findById').mockResolvedValue({ ...paciente(), perfil_id: '11111111-1111-4111-8111-000000000007' });

      const res = await request(app).get(`/api/pacientes/${PACIENTE_ID}/historial`).set(headers);

      expect(res.status).toBe(403);
    });

    test('paciente que no existe → 404', async () => {
      const headers = await sesionComo('administrador');
      pacientes('findById').mockResolvedValue(null);

      const res = await request(app).get(`/api/pacientes/${PACIENTE_ID}/historial`).set(headers);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/pacientes/:id/expediente', () => {
    test('el médico tratante actualiza alergias y tipo de sangre', async () => {
      const headers = await comoDoctor();
      pacientes('findById').mockResolvedValue(paciente());
      pacientes('esTratante').mockResolvedValue(true);
      repo('findExpediente').mockResolvedValue(expediente());
      const actualizar = repo('actualizarExpediente').mockResolvedValue({ ...expediente(), alergias: 'Sulfas' });

      const res = await request(app)
        .patch(`/api/pacientes/${PACIENTE_ID}/expediente`)
        .set(headers)
        .send({ alergias: 'Sulfas', tipo_sangre: 'O+' });

      expect(res.status).toBe(200);
      expect(ExpedienteSchema.safeParse(res.body.data).success).toBe(true);
      expect(actualizar).toHaveBeenCalledWith(PACIENTE_ID, { alergias: 'Sulfas', tipo_sangre: 'O+' });
    });

    test('un doctor que no lo atiende → 403', async () => {
      const headers = await comoDoctor(OTRO_DOCTOR);
      pacientes('findById').mockResolvedValue(paciente());
      pacientes('esTratante').mockResolvedValue(false);

      const res = await request(app)
        .patch(`/api/pacientes/${PACIENTE_ID}/expediente`)
        .set(headers)
        .send({ alergias: 'x' });

      expect(res.status).toBe(403);
    });

    test.each(['administrador', 'paciente', 'recepcionista'] as const)(
      '%s no edita el expediente → 403',
      async (rol) => {
        const headers = await sesionComo(rol);

        const res = await request(app)
          .patch(`/api/pacientes/${PACIENTE_ID}/expediente`)
          .set(headers)
          .send({ alergias: 'x' });

        expect(res.status).toBe(403);
      },
    );

    test('tipo de sangre inválido → 400', async () => {
      const headers = await comoDoctor();

      const res = await request(app)
        .patch(`/api/pacientes/${PACIENTE_ID}/expediente`)
        .set(headers)
        .send({ tipo_sangre: 'Z+' });

      expect(res.status).toBe(400);
    });
  });
});
