import request from 'supertest';
import { PacienteSchema } from '../../src/domain/dtos/pacientes.dto';
import { PacienteConExpediente, PacientesRepository } from '../../src/repositories/pacientes.repository';
import { app } from '../helpers/app';
import { sesionComo, USUARIOS } from '../helpers/auth';

const PACIENTE_ID = 'bbbbbbbb-0000-4000-8000-000000000004';
const OTRO_PACIENTE_ID = 'bbbbbbbb-0000-4000-8000-000000000099';
const PERSONAL_DOCTOR = 'cccccccc-0000-4000-8000-000000000002';

const paciente = (cambios: Partial<PacienteConExpediente> = {}): PacienteConExpediente => ({
  id: PACIENTE_ID,
  perfil_id: USUARIOS.paciente,
  nombres: 'Carlos',
  apellidos: 'Martínez Rivas',
  documento_identidad: '01234567-8',
  fecha_nacimiento: new Date('1990-05-14T00:00:00Z'),
  sexo: 'masculino',
  telefono: '+503 7000-0004',
  direccion: null,
  contacto_emergencia: 'María Rivas (madre)',
  telefono_emergencia: '+503 7000-0005',
  created_at: new Date('2026-10-24T12:00:00Z'),
  activo: true,
  expedientes: { numero_expediente: 'EXP-2026-00001' },
  ...cambios,
});

const nuevoPaciente = {
  nombres: 'Lucía',
  apellidos: 'Ramírez Torres',
  documento_identidad: '04567890-1',
  fecha_nacimiento: '1985-03-02',
  sexo: 'femenino',
  telefono: '+503 7111-2222',
};

const spy = <K extends keyof PacientesRepository>(metodo: K) => jest.spyOn(PacientesRepository.prototype, metodo);

describe('Pacientes API', () => {
  describe('Autenticación', () => {
    test.each([
      ['get', '/api/pacientes'],
      ['post', '/api/pacientes'],
      ['get', `/api/pacientes/${PACIENTE_ID}`],
      ['patch', `/api/pacientes/${PACIENTE_ID}`],
      ['delete', `/api/pacientes/${PACIENTE_ID}`],
    ] as const)('%s %s sin token → 401', async (method, url) => {
      const res = await request(app)[method](url).send({});

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_AUTENTICADO');
    });
  });

  describe('GET /api/pacientes', () => {
    test.each(['administrador', 'recepcionista'] as const)('%s ve todos (solo activos por defecto)', async (rol) => {
      const headers = await sesionComo(rol);
      const listar = spy('listar').mockResolvedValue([[paciente()], 41]);

      const res = await request(app).get('/api/pacientes?pagina=2&por_pagina=20&buscar=mart').set(headers);

      expect(res.status).toBe(200);
      expect(PacienteSchema.safeParse(res.body.data.items[0]).success).toBe(true);
      expect(res.body.data.paginacion).toEqual({ pagina: 2, por_pagina: 20, total: 41, total_paginas: 3 });
      expect(listar).toHaveBeenCalledWith({ buscar: 'mart', activo: true, tratadosPor: undefined }, 20, 20);
    });

    test('filtra inactivos con activo=false', async () => {
      const headers = await sesionComo('administrador');
      const listar = spy('listar').mockResolvedValue([[], 0]);

      const res = await request(app).get('/api/pacientes?activo=false').set(headers);

      expect(res.status).toBe(200);
      expect(listar.mock.calls[0][0]).toMatchObject({ activo: false });
    });

    test('un doctor solo lista a los pacientes que atiende', async () => {
      const headers = await sesionComo('doctor');
      spy('findPersonalIdDePerfil').mockResolvedValue(PERSONAL_DOCTOR);
      const listar = spy('listar').mockResolvedValue([[paciente()], 1]);

      const res = await request(app).get('/api/pacientes').set(headers);

      expect(res.status).toBe(200);
      expect(listar.mock.calls[0][0]).toMatchObject({ tratadosPor: PERSONAL_DOCTOR });
    });

    test('un doctor sin registro de personal → 403 PERFIL_INCOMPLETO', async () => {
      const headers = await sesionComo('doctor');
      spy('findPersonalIdDePerfil').mockResolvedValue(null);

      const res = await request(app).get('/api/pacientes').set(headers);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERFIL_INCOMPLETO');
    });

    test('un paciente no puede listar pacientes → 403', async () => {
      const headers = await sesionComo('paciente');

      const res = await request(app).get('/api/pacientes').set(headers);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCESO_DENEGADO');
    });

    test('400 con el detalle del campo si la paginación es inválida', async () => {
      const headers = await sesionComo('administrador');

      const res = await request(app).get('/api/pacientes?por_pagina=500&buscar=a').set(headers);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION');
      expect(res.body.errors.map((e: { field: string }) => e.field)).toEqual(
        expect.arrayContaining(['por_pagina', 'buscar']),
      );
    });
  });

  describe('POST /api/pacientes', () => {
    test.each(['administrador', 'recepcionista'] as const)('%s registra un paciente → 201', async (rol) => {
      const headers = await sesionComo(rol);
      spy('existeDocumento').mockResolvedValue(false);
      const crear = spy('crear').mockResolvedValue(
        paciente({ id: OTRO_PACIENTE_ID, perfil_id: null, expedientes: { numero_expediente: 'EXP-2026-00002' } }),
      );

      const res = await request(app).post('/api/pacientes').set(headers).send(nuevoPaciente);

      expect(res.status).toBe(201);
      expect(PacienteSchema.safeParse(res.body.data).success).toBe(true);
      expect(res.body.data).toMatchObject({ perfil_id: null, numero_expediente: 'EXP-2026-00002' });
      expect(crear).toHaveBeenCalledWith(nuevoPaciente);
    });

    test.each(['doctor', 'paciente'] as const)('%s no puede crear pacientes → 403', async (rol) => {
      const headers = await sesionComo(rol);
      const crear = spy('crear');

      const res = await request(app).post('/api/pacientes').set(headers).send(nuevoPaciente);

      expect(res.status).toBe(403);
      expect(crear).not.toHaveBeenCalled();
    });

    test('400 con el detalle de cada campo inválido', async () => {
      const headers = await sesionComo('recepcionista');

      const res = await request(app)
        .post('/api/pacientes')
        .set(headers)
        .send({ apellidos: 'Ramírez', telefono: '12', fecha_nacimiento: '02/03/1985', sexo: 'x' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION');
      expect(res.body.errors.map((e: { field: string }) => e.field)).toEqual(
        expect.arrayContaining(['nombres', 'telefono', 'fecha_nacimiento', 'sexo']),
      );
    });

    test('409 REGISTRO_DUPLICADO si el documento ya existe', async () => {
      const headers = await sesionComo('recepcionista');
      spy('existeDocumento').mockResolvedValue(true);
      const crear = spy('crear');

      const res = await request(app).post('/api/pacientes').set(headers).send(nuevoPaciente);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('REGISTRO_DUPLICADO');
      expect(crear).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/pacientes/:id', () => {
    test.each(['administrador', 'recepcionista'] as const)('%s ve cualquier paciente', async (rol) => {
      const headers = await sesionComo(rol);
      spy('findById').mockResolvedValue(paciente());

      const res = await request(app).get(`/api/pacientes/${PACIENTE_ID}`).set(headers);

      expect(res.status).toBe(200);
      expect(PacienteSchema.safeParse(res.body.data).success).toBe(true);
      expect(res.body.data).toMatchObject({ fecha_nacimiento: '1990-05-14', numero_expediente: 'EXP-2026-00001' });
    });

    test('un paciente ve su propia ficha', async () => {
      const headers = await sesionComo('paciente');
      spy('findById').mockResolvedValue(paciente());

      const res = await request(app).get(`/api/pacientes/${PACIENTE_ID}`).set(headers);

      expect(res.status).toBe(200);
    });

    test('un paciente no puede ver la ficha de otro → 403', async () => {
      const headers = await sesionComo('paciente');
      spy('findById').mockResolvedValue(paciente({ id: OTRO_PACIENTE_ID, perfil_id: null }));

      const res = await request(app).get(`/api/pacientes/${OTRO_PACIENTE_ID}`).set(headers);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCESO_DENEGADO');
    });

    test('un doctor ve a un paciente que atiende', async () => {
      const headers = await sesionComo('doctor');
      spy('findById').mockResolvedValue(paciente());
      spy('findPersonalIdDePerfil').mockResolvedValue(PERSONAL_DOCTOR);
      const esTratante = spy('esTratante').mockResolvedValue(true);

      const res = await request(app).get(`/api/pacientes/${PACIENTE_ID}`).set(headers);

      expect(res.status).toBe(200);
      expect(esTratante).toHaveBeenCalledWith(PACIENTE_ID, PERSONAL_DOCTOR);
    });

    test('un doctor no ve a un paciente que no atiende → 403', async () => {
      const headers = await sesionComo('doctor');
      spy('findById').mockResolvedValue(paciente());
      spy('findPersonalIdDePerfil').mockResolvedValue(PERSONAL_DOCTOR);
      spy('esTratante').mockResolvedValue(false);

      const res = await request(app).get(`/api/pacientes/${PACIENTE_ID}`).set(headers);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCESO_DENEGADO');
    });

    test('404 si no existe', async () => {
      const headers = await sesionComo('administrador');
      spy('findById').mockResolvedValue(null);

      const res = await request(app).get(`/api/pacientes/${OTRO_PACIENTE_ID}`).set(headers);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NO_ENCONTRADO');
    });

    test('400 si el id no es un UUID', async () => {
      const headers = await sesionComo('administrador');

      const res = await request(app).get('/api/pacientes/123').set(headers);

      expect(res.status).toBe(400);
      expect(res.body.errors[0].field).toBe('id');
    });
  });

  describe('PATCH /api/pacientes/:id', () => {
    test.each(['administrador', 'recepcionista'] as const)('%s edita datos personales', async (rol) => {
      const headers = await sesionComo(rol);
      spy('findById').mockResolvedValue(paciente());
      spy('existeDocumento').mockResolvedValue(false);
      const actualizar = spy('actualizar').mockResolvedValue(paciente({ direccion: 'Santa Ana' }));

      const res = await request(app)
        .patch(`/api/pacientes/${PACIENTE_ID}`)
        .set(headers)
        .send({ direccion: 'Santa Ana' });

      expect(res.status).toBe(200);
      expect(res.body.data.direccion).toBe('Santa Ana');
      expect(actualizar).toHaveBeenCalledWith(PACIENTE_ID, { direccion: 'Santa Ana' });
    });

    test('recepción reactiva a un paciente con activo: true', async () => {
      const headers = await sesionComo('recepcionista');
      spy('findById').mockResolvedValue(paciente({ activo: false }));
      const actualizar = spy('actualizar').mockResolvedValue(paciente());

      const res = await request(app).patch(`/api/pacientes/${PACIENTE_ID}`).set(headers).send({ activo: true });

      expect(res.status).toBe(200);
      expect(actualizar).toHaveBeenCalledWith(PACIENTE_ID, { activo: true });
    });

    test('un paciente edita sus propios datos', async () => {
      const headers = await sesionComo('paciente');
      spy('findById').mockResolvedValue(paciente());
      const actualizar = spy('actualizar').mockResolvedValue(paciente({ telefono: '+503 7999-0000' }));

      const res = await request(app)
        .patch(`/api/pacientes/${PACIENTE_ID}`)
        .set(headers)
        .send({ telefono: '+503 7999-0000' });

      expect(res.status).toBe(200);
      expect(actualizar).toHaveBeenCalled();
    });

    test('un paciente no puede editar a otro → 403', async () => {
      const headers = await sesionComo('paciente');
      spy('findById').mockResolvedValue(paciente({ id: OTRO_PACIENTE_ID, perfil_id: null }));
      const actualizar = spy('actualizar');

      const res = await request(app).patch(`/api/pacientes/${OTRO_PACIENTE_ID}`).set(headers).send({ direccion: 'x' });

      expect(res.status).toBe(403);
      expect(actualizar).not.toHaveBeenCalled();
    });

    test('un paciente no puede activarse o desactivarse → 403', async () => {
      const headers = await sesionComo('paciente');
      const actualizar = spy('actualizar');

      const res = await request(app).patch(`/api/pacientes/${PACIENTE_ID}`).set(headers).send({ activo: false });

      expect(res.status).toBe(403);
      expect(actualizar).not.toHaveBeenCalled();
    });

    test('un doctor no puede editar pacientes → 403', async () => {
      const headers = await sesionComo('doctor');

      const res = await request(app).patch(`/api/pacientes/${PACIENTE_ID}`).set(headers).send({ direccion: 'x' });

      expect(res.status).toBe(403);
    });

    test('400 si no se envía ningún campo', async () => {
      const headers = await sesionComo('recepcionista');

      const res = await request(app).patch(`/api/pacientes/${PACIENTE_ID}`).set(headers).send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SOLICITUD_INVALIDA');
    });

    test('400 con el detalle del campo inválido', async () => {
      const headers = await sesionComo('recepcionista');

      const res = await request(app).patch(`/api/pacientes/${PACIENTE_ID}`).set(headers).send({ nombres: '' });

      expect(res.status).toBe(400);
      expect(res.body.errors[0].field).toBe('nombres');
    });

    test('409 si el documento ya pertenece a otro paciente', async () => {
      const headers = await sesionComo('recepcionista');
      spy('findById').mockResolvedValue(paciente());
      const existe = spy('existeDocumento').mockResolvedValue(true);

      const res = await request(app)
        .patch(`/api/pacientes/${PACIENTE_ID}`)
        .set(headers)
        .send({ documento_identidad: '09999999-9' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('REGISTRO_DUPLICADO');
      expect(existe).toHaveBeenCalledWith('09999999-9', PACIENTE_ID);
    });

    test('404 si no existe', async () => {
      const headers = await sesionComo('administrador');
      spy('findById').mockResolvedValue(null);

      const res = await request(app).patch(`/api/pacientes/${OTRO_PACIENTE_ID}`).set(headers).send({ direccion: 'x' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/pacientes/:id', () => {
    test.each(['administrador', 'recepcionista'] as const)('%s desactiva (lógico) al paciente', async (rol) => {
      const headers = await sesionComo(rol);
      spy('findById').mockResolvedValue(paciente());
      const actualizar = spy('actualizar').mockResolvedValue(paciente({ activo: false }));

      const res = await request(app).delete(`/api/pacientes/${PACIENTE_ID}`).set(headers);

      expect(res.status).toBe(200);
      expect(res.body.data.activo).toBe(false);
      expect(actualizar).toHaveBeenCalledWith(PACIENTE_ID, { activo: false });
    });

    test.each(['doctor', 'paciente'] as const)('%s no puede desactivar pacientes → 403', async (rol) => {
      const headers = await sesionComo(rol);

      const res = await request(app).delete(`/api/pacientes/${PACIENTE_ID}`).set(headers);

      expect(res.status).toBe(403);
    });

    test('404 si no existe', async () => {
      const headers = await sesionComo('recepcionista');
      spy('findById').mockResolvedValue(null);

      const res = await request(app).delete(`/api/pacientes/${OTRO_PACIENTE_ID}`).set(headers);

      expect(res.status).toBe(404);
    });
  });
});
