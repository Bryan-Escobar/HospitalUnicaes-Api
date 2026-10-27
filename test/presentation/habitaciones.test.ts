import request from 'supertest';
import {
  CamaSchema,
  HabitacionSchema,
  HospitalizacionDetalleSchema,
  HospitalizacionSchema,
} from '../../src/domain/dtos/habitaciones.dto';
import {
  CamaConHabitacion,
  HabitacionConCamas,
  HabitacionesRepository,
  HospitalizacionDetalle,
} from '../../src/repositories/habitaciones.repository';
import { PacientesRepository } from '../../src/repositories/pacientes.repository';
import { app } from '../helpers/app';
import { sesionComo, USUARIOS } from '../helpers/auth';

const HOSP_ID = 'aaaaaaaa-0000-4000-8000-000000000061';
const PACIENTE_ID = 'bbbbbbbb-0000-4000-8000-000000000005';
const CAMA_ID = 'dddddddd-0000-4000-8000-000000000201';
const OTRA_CAMA = 'dddddddd-0000-4000-8000-000000000206';
const PERSONAL_DOCTOR = 'cccccccc-0000-4000-8000-000000000002';
const PERSONAL_RECEPCION = 'cccccccc-0000-4000-8000-000000000003';

const habitacionVip = {
  id: 'eeeeeeee-0000-4000-8000-000000000301',
  codigo: 'VIP-301',
  planta: 3,
  tipo: 'vip' as const,
};

const cama = (estado: 'disponible' | 'ocupada' | 'limpieza' | 'mantenimiento' = 'disponible'): CamaConHabitacion => ({
  id: CAMA_ID,
  habitacion_id: habitacionVip.id,
  codigo: 'VIP-301-A',
  estado,
  habitaciones: habitacionVip,
});

const mapa = (): HabitacionConCamas[] => [
  {
    ...habitacionVip,
    capacidad: 1,
    activa: true,
    camas: [
      {
        id: CAMA_ID,
        habitacion_id: habitacionVip.id,
        codigo: 'VIP-301-A',
        estado: 'ocupada',
        hospitalizaciones: [
          {
            id: HOSP_ID,
            fecha_ingreso: new Date('2026-10-24T10:00:00Z'),
            pacientes: { id: PACIENTE_ID, nombres: 'Rosa Elena', apellidos: 'Guzmán de Flores', sexo: 'femenino' },
          },
        ],
      },
    ],
  },
];

const hospitalizacion = (cambios: Partial<HospitalizacionDetalle> = {}): HospitalizacionDetalle => ({
  id: HOSP_ID,
  paciente_id: PACIENTE_ID,
  cama_id: CAMA_ID,
  doctor_tratante_id: PERSONAL_DOCTOR,
  fecha_ingreso: new Date('2026-10-24T10:00:00Z'),
  fecha_alta: null,
  motivo_ingreso: 'Descompensación de diabetes',
  estado: 'activa',
  ingresado_por: PERSONAL_RECEPCION,
  alta_por: null,
  notas_alta: null,
  pacientes: { id: PACIENTE_ID, nombres: 'Rosa Elena', apellidos: 'Guzmán de Flores', perfil_id: null },
  camas: { id: CAMA_ID, codigo: 'VIP-301-A', habitaciones: habitacionVip },
  personal: {
    id: PERSONAL_DOCTOR,
    nombres: 'Roberto',
    apellidos: 'Castillo Peña',
    especialidades: { nombre: 'Medicina interna' },
  },
  movimientos_cama: [
    {
      id: 'aaaaaaaa-0000-4000-8000-000000000071',
      hospitalizacion_id: HOSP_ID,
      tipo: 'ingreso',
      cama_origen_id: null,
      cama_destino_id: CAMA_ID,
      registrado_por: PERSONAL_RECEPCION,
      notas: null,
      created_at: new Date('2026-10-24T10:00:00Z'),
      camas_movimientos_cama_cama_origen_idTocamas: null,
      camas_movimientos_cama_cama_destino_idTocamas: { id: CAMA_ID, codigo: 'VIP-301-A' },
      personal: { id: PERSONAL_RECEPCION, nombres: 'Lucía', apellidos: 'Herrera Gómez' },
    },
  ],
  ...cambios,
});

/** Error tal como lo entrega Prisma ($queryRaw) cuando una función de Postgres lanza 'CODIGO: detalle'. */
const errorBd = (mensaje: string) =>
  new Error(
    `Invalid \`prisma.$queryRaw()\` invocation:\n\nRaw query failed. Code: \`PT409\`. Message: \`ERROR: ${mensaje}\``,
  );

const repo = <K extends keyof HabitacionesRepository>(m: K) => jest.spyOn(HabitacionesRepository.prototype, m);
const personalDe = (id: string | null) =>
  jest.spyOn(PacientesRepository.prototype, 'findPersonalIdDePerfil').mockResolvedValue(id);

describe('Habitaciones y camas API (HUNI-66)', () => {
  describe('Autenticación', () => {
    test.each([
      ['get', '/api/habitaciones'],
      ['get', '/api/camas'],
      ['get', '/api/camas/sugerencia?tipo=vip'],
      ['patch', `/api/camas/${CAMA_ID}/estado`],
      ['post', '/api/hospitalizaciones'],
      ['get', '/api/hospitalizaciones'],
      ['get', `/api/hospitalizaciones/${HOSP_ID}`],
      ['post', `/api/hospitalizaciones/${HOSP_ID}/alta`],
      ['post', `/api/hospitalizaciones/${HOSP_ID}/traslado`],
    ] as const)('%s %s sin token → 401', async (method, url) => {
      const res = await request(app)[method](url).send({});

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/habitaciones (mapa)', () => {
    test.each(['administrador', 'recepcionista'] as const)('%s ve el ocupante con su sexo', async (rol) => {
      repo('listarHabitaciones').mockResolvedValue(mapa());

      const res = await request(app)
        .get('/api/habitaciones?planta=3')
        .set(await sesionComo(rol));

      expect(res.status).toBe(200);
      expect(HabitacionSchema.safeParse(res.body.data[0]).success).toBe(true);
      expect(res.body.data[0].camas[0].ocupante.paciente).toMatchObject({ nombres: 'Rosa Elena', sexo: 'femenino' });
    });

    test('un doctor ve el ocupante solo si es su médico tratante', async () => {
      repo('listarHabitaciones').mockResolvedValue(mapa());
      const tratados = repo('pacientesTratados').mockResolvedValueOnce(new Set([PACIENTE_ID]));
      personalDe(PERSONAL_DOCTOR);
      const headers = await sesionComo('doctor');

      const tratante = await request(app).get('/api/habitaciones').set(headers);
      tratados.mockResolvedValueOnce(new Set());
      const otro = await request(app).get('/api/habitaciones').set(headers);

      expect(tratante.body.data[0].camas[0].ocupante).not.toBeNull();
      expect(otro.body.data[0].camas[0]).toMatchObject({ estado: 'ocupada', ocupante: null });
      expect(tratados).toHaveBeenCalledWith(PERSONAL_DOCTOR, [PACIENTE_ID]);
    });

    test('paciente → 403', async () => {
      const res = await request(app)
        .get('/api/habitaciones')
        .set(await sesionComo('paciente'));

      expect(res.status).toBe(403);
    });

    test('planta inválida → 400', async () => {
      const res = await request(app)
        .get('/api/habitaciones?planta=4')
        .set(await sesionComo('administrador'));

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/camas y /api/camas/sugerencia', () => {
    test('recepción lista camas filtradas', async () => {
      const listar = repo('listarCamas').mockResolvedValue([cama()]);

      const res = await request(app)
        .get('/api/camas?tipo=vip&estado=disponible')
        .set(await sesionComo('recepcionista'));

      expect(res.status).toBe(200);
      expect(CamaSchema.safeParse(res.body.data[0]).success).toBe(true);
      expect(listar).toHaveBeenCalledWith({ tipo: 'vip', estado: 'disponible' });
    });

    test('doctor no lista camas → 403', async () => {
      const res = await request(app)
        .get('/api/camas')
        .set(await sesionComo('doctor'));

      expect(res.status).toBe(403);
    });

    test('sugiere una cama libre del tipo', async () => {
      const sugerir = repo('sugerirCama').mockResolvedValue(cama());

      const res = await request(app)
        .get('/api/camas/sugerencia?tipo=semiprivada')
        .set(await sesionComo('recepcionista'));

      expect(res.status).toBe(200);
      expect(sugerir).toHaveBeenCalledWith('semiprivada');
    });

    test('sin camas libres → 409 SIN_CAMAS_DISPONIBLES', async () => {
      repo('sugerirCama').mockResolvedValue(null);

      const res = await request(app)
        .get('/api/camas/sugerencia?tipo=vip')
        .set(await sesionComo('recepcionista'));

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SIN_CAMAS_DISPONIBLES');
    });

    test('sin tipo → 400', async () => {
      const res = await request(app)
        .get('/api/camas/sugerencia')
        .set(await sesionComo('recepcionista'));

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/camas/:id/estado', () => {
    test('limpieza → disponible', async () => {
      repo('findCama').mockResolvedValue(cama('limpieza'));
      const cambiar = repo('cambiarEstadoCama').mockResolvedValue(cama('disponible'));

      const res = await request(app)
        .patch(`/api/camas/${CAMA_ID}/estado`)
        .set(await sesionComo('recepcionista'))
        .send({ estado: 'disponible' });

      expect(res.status).toBe(200);
      expect(cambiar).toHaveBeenCalledWith(CAMA_ID, 'disponible');
    });

    test('una cama ocupada no se cambia a mano → 409 CAMA_OCUPADA', async () => {
      repo('findCama').mockResolvedValue(cama('ocupada'));
      const cambiar = repo('cambiarEstadoCama');

      const res = await request(app)
        .patch(`/api/camas/${CAMA_ID}/estado`)
        .set(await sesionComo('recepcionista'))
        .send({ estado: 'disponible' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CAMA_OCUPADA');
      expect(cambiar).not.toHaveBeenCalled();
    });

    test('"ocupada" no se pone a mano → 400 VALIDACION', async () => {
      const res = await request(app)
        .patch(`/api/camas/${CAMA_ID}/estado`)
        .set(await sesionComo('recepcionista'))
        .send({ estado: 'ocupada' });

      expect(res.status).toBe(400);
    });

    test('cama que no existe → 404', async () => {
      repo('findCama').mockResolvedValue(null);

      const res = await request(app)
        .patch(`/api/camas/${CAMA_ID}/estado`)
        .set(await sesionComo('administrador'))
        .send({ estado: 'mantenimiento' });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/hospitalizaciones (asignar cama)', () => {
    const body = {
      paciente_id: PACIENTE_ID,
      doctor_tratante_id: PERSONAL_DOCTOR,
      tipo_habitacion: 'vip',
      motivo_ingreso: 'Observación',
    };

    test('recepción ingresa al paciente → 201 con su historial y queda como autora', async () => {
      personalDe(PERSONAL_RECEPCION);
      const ingresar = repo('ingresar').mockResolvedValue(HOSP_ID);
      repo('findHospitalizacion').mockResolvedValue(hospitalizacion());

      const res = await request(app)
        .post('/api/hospitalizaciones')
        .set(await sesionComo('recepcionista'))
        .send(body);

      expect(res.status).toBe(201);
      expect(HospitalizacionDetalleSchema.safeParse(res.body.data).success).toBe(true);
      expect(res.body.data.movimientos[0]).toMatchObject({ tipo: 'ingreso', cama_destino: { codigo: 'VIP-301-A' } });
      expect(ingresar).toHaveBeenCalledWith(body, PERSONAL_RECEPCION);
    });

    test.each([
      ['CAMA_OCUPADA: la cama VIP-301-A ya tiene un paciente', 409, 'CAMA_OCUPADA'],
      ['PACIENTE_YA_HOSPITALIZADO: el paciente ya ocupa una cama', 409, 'PACIENTE_YA_HOSPITALIZADO'],
      ['SIN_CAMAS_DISPONIBLES: no hay camas vip libres', 409, 'SIN_CAMAS_DISPONIBLES'],
      ['CAMA_NO_DISPONIBLE: la cama VIP-301-A está en limpieza', 409, 'CAMA_NO_DISPONIBLE'],
      ['REFERENCIA_INVALIDA: el paciente no existe', 400, 'REFERENCIA_INVALIDA'],
      ['REGLA_DE_NEGOCIO: el doctor tratante debe ser un médico activo', 422, 'REGLA_DE_NEGOCIO'],
    ])('la BD responde "%s" → %s', async (mensaje, status, code) => {
      personalDe(PERSONAL_RECEPCION);
      repo('ingresar').mockRejectedValue(errorBd(mensaje));

      const res = await request(app)
        .post('/api/hospitalizaciones')
        .set(await sesionComo('recepcionista'))
        .send(body);

      expect(res.status).toBe(status);
      expect(res.body.code).toBe(code);
    });

    test('dos solicitudes simultáneas por la última cama: una 201 y otra 409', async () => {
      personalDe(PERSONAL_RECEPCION);
      repo('ingresar')
        .mockResolvedValueOnce(HOSP_ID)
        .mockRejectedValueOnce(errorBd('SIN_CAMAS_DISPONIBLES: no hay camas vip libres'));
      repo('findHospitalizacion').mockResolvedValue(hospitalizacion());
      const headers = await sesionComo('recepcionista');

      const respuestas = await Promise.all([
        request(app).post('/api/hospitalizaciones').set(headers).send(body),
        request(app)
          .post('/api/hospitalizaciones')
          .set(headers)
          .send({ ...body, paciente_id: 'bbbbbbbb-0000-4000-8000-000000000006' }),
      ]);

      expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    });

    test('sin cama_id ni tipo_habitacion → 400 VALIDACION', async () => {
      const res = await request(app)
        .post('/api/hospitalizaciones')
        .set(await sesionComo('recepcionista'))
        .send({ paciente_id: PACIENTE_ID, doctor_tratante_id: PERSONAL_DOCTOR });

      expect(res.status).toBe(400);
    });

    test.each(['doctor', 'paciente'] as const)('%s no asigna camas → 403', async (rol) => {
      const res = await request(app)
        .post('/api/hospitalizaciones')
        .set(await sesionComo(rol))
        .send(body);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/hospitalizaciones', () => {
    test('un doctor ve las de sus pacientes', async () => {
      personalDe(PERSONAL_DOCTOR);
      const listar = repo('listarHospitalizaciones').mockResolvedValue([[hospitalizacion()], 1]);

      const res = await request(app)
        .get('/api/hospitalizaciones?estado=activa')
        .set(await sesionComo('doctor'));

      expect(res.status).toBe(200);
      expect(HospitalizacionSchema.safeParse(res.body.data.items[0]).success).toBe(true);
      expect(listar.mock.calls[0][0]).toEqual({
        estado: 'activa',
        pacienteId: undefined,
        tratadosPor: PERSONAL_DOCTOR,
      });
    });

    test('un paciente ve solo las suyas', async () => {
      const listar = repo('listarHospitalizaciones').mockResolvedValue([[], 0]);

      await request(app)
        .get('/api/hospitalizaciones')
        .set(await sesionComo('paciente'));

      expect(listar.mock.calls[0][0]).toMatchObject({ perfilPaciente: USUARIOS.paciente });
    });
  });

  describe('GET /api/hospitalizaciones/:id', () => {
    test('recepción la ve con su historial', async () => {
      repo('findHospitalizacion').mockResolvedValue(hospitalizacion());

      const res = await request(app)
        .get(`/api/hospitalizaciones/${HOSP_ID}`)
        .set(await sesionComo('recepcionista'));

      expect(res.status).toBe(200);
      expect(res.body.data.movimientos).toHaveLength(1);
    });

    test('el paciente ve la suya; otra → 403', async () => {
      const find = repo('findHospitalizacion').mockResolvedValueOnce(
        hospitalizacion({ pacientes: { id: PACIENTE_ID, nombres: 'C', apellidos: 'M', perfil_id: USUARIOS.paciente } }),
      );
      const headers = await sesionComo('paciente');

      const propia = await request(app).get(`/api/hospitalizaciones/${HOSP_ID}`).set(headers);
      find.mockResolvedValueOnce(hospitalizacion());
      const ajena = await request(app).get(`/api/hospitalizaciones/${HOSP_ID}`).set(headers);

      expect(propia.status).toBe(200);
      expect(ajena.status).toBe(403);
    });

    test('un doctor que no atiende al paciente → 403', async () => {
      personalDe('cccccccc-0000-4000-8000-000000000005');
      repo('findHospitalizacion').mockResolvedValue(hospitalizacion());
      jest.spyOn(PacientesRepository.prototype, 'esTratante').mockResolvedValue(false);

      const res = await request(app)
        .get(`/api/hospitalizaciones/${HOSP_ID}`)
        .set(await sesionComo('doctor'));

      expect(res.status).toBe(403);
    });

    test('no existe → 404', async () => {
      repo('findHospitalizacion').mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/hospitalizaciones/${HOSP_ID}`)
        .set(await sesionComo('administrador'));

      expect(res.status).toBe(404);
    });
  });

  describe('Alta y traslado', () => {
    test('alta → 200: la hospitalización queda en el historial con sus notas', async () => {
      personalDe(PERSONAL_RECEPCION);
      const alta = repo('darAlta').mockResolvedValue();
      repo('findHospitalizacion').mockResolvedValue(
        hospitalizacion({ estado: 'alta', fecha_alta: new Date('2026-10-26T12:00:00Z'), notas_alta: 'Alta médica' }),
      );

      const res = await request(app)
        .post(`/api/hospitalizaciones/${HOSP_ID}/alta`)
        .set(await sesionComo('recepcionista'))
        .send({ notas: 'Alta médica' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ estado: 'alta', notas_alta: 'Alta médica' });
      expect(alta).toHaveBeenCalledWith(HOSP_ID, 'Alta médica', PERSONAL_RECEPCION);
    });

    test.each([
      ['HOSPITALIZACION_FINALIZADA: la hospitalización ya tiene alta', 409],
      ['NO_ENCONTRADO: la hospitalización no existe', 404],
    ])('alta: la BD responde "%s" → %s', async (mensaje, status) => {
      personalDe(PERSONAL_RECEPCION);
      repo('darAlta').mockRejectedValue(errorBd(mensaje));

      const res = await request(app)
        .post(`/api/hospitalizaciones/${HOSP_ID}/alta`)
        .set(await sesionComo('administrador'))
        .send({});

      expect(res.status).toBe(status);
    });

    test('traslado → 200', async () => {
      personalDe(PERSONAL_RECEPCION);
      const trasladar = repo('trasladar').mockResolvedValue();
      repo('findHospitalizacion').mockResolvedValue(hospitalizacion());

      const res = await request(app)
        .post(`/api/hospitalizaciones/${HOSP_ID}/traslado`)
        .set(await sesionComo('recepcionista'))
        .send({ cama_id: OTRA_CAMA });

      expect(res.status).toBe(200);
      expect(trasladar).toHaveBeenCalledWith(HOSP_ID, OTRA_CAMA, PERSONAL_RECEPCION);
    });

    test.each([
      ['CAMA_OCUPADA: la cama HAB-206-A ya tiene un paciente', 409, 'CAMA_OCUPADA'],
      ['SOLICITUD_INVALIDA: el paciente ya está en esa cama', 400, 'SOLICITUD_INVALIDA'],
    ])('traslado: la BD responde "%s" → %s', async (mensaje, status, code) => {
      personalDe(PERSONAL_RECEPCION);
      repo('trasladar').mockRejectedValue(errorBd(mensaje));

      const res = await request(app)
        .post(`/api/hospitalizaciones/${HOSP_ID}/traslado`)
        .set(await sesionComo('recepcionista'))
        .send({ cama_id: OTRA_CAMA });

      expect(res.status).toBe(status);
      expect(res.body.code).toBe(code);
    });

    test('doctor no da altas → 403', async () => {
      const res = await request(app)
        .post(`/api/hospitalizaciones/${HOSP_ID}/alta`)
        .set(await sesionComo('doctor'))
        .send({});

      expect(res.status).toBe(403);
    });
  });
});
