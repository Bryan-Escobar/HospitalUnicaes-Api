import request from 'supertest';
import {
  AmbulanciaSchema,
  BitacoraAmbulanciaSchema,
  SeguimientoSolicitudPublicaSchema,
  SolicitudAmbulanciaSchema,
} from '../../src/domain/dtos/ambulancia.dto';
import { Prisma } from '../../src/generated/prisma/client';
import { limiteSolicitudPublica } from '../../src/presentation/Ambulancia/routes';
import {
  AmbulanciaConServicio,
  AmbulanciaRepository,
  BitacoraCompleta,
  SolicitudCompleta,
} from '../../src/repositories/ambulancia.repository';
import { app } from '../helpers/app';
import { sesionComo, USUARIOS } from '../helpers/auth';

const AMBULANCIA_ID = 'aaaaaaaa-0000-4000-8000-000000000070';
const SOLICITUD_ID = 'aaaaaaaa-0000-4000-8000-000000000071';
const PACIENTE_ID = 'bbbbbbbb-0000-4000-8000-000000000004';
const OTRO_PACIENTE = 'bbbbbbbb-0000-4000-8000-000000000009';
const CODIGO = 'demo-seguimiento-publico-0001';

const solicitud = (cambios: Partial<SolicitudCompleta> = {}): SolicitudCompleta => ({
  id: SOLICITUD_ID,
  ambulancia_id: AMBULANCIA_ID,
  solicitada_por: USUARIOS.recepcionista,
  paciente_id: PACIENTE_ID,
  direccion_origen: 'Santa Ana, colonia El Palmar, pasaje 3 #12',
  destino: 'Hospital Universitario Central',
  descripcion_emergencia: 'Dolor en el pecho',
  prioridad: 'critica',
  estado: 'pendiente',
  fecha_solicitud: new Date('2026-10-28T15:00:00Z'),
  fecha_despacho: null,
  fecha_cierre: null,
  canal: 'app',
  tipo_emergencia: 'cardiaca',
  latitud: new Prisma.Decimal('13.987900'),
  longitud: new Prisma.Decimal('-89.548300'),
  precision_m: 10,
  telefono_contacto: '+503 7000-0004',
  nombre_contacto: null,
  codigo_seguimiento: null,
  fecha_en_curso: null,
  despachada_por: null,
  cerrada_por: null,
  notas_cierre: null,
  motivo_cancelacion: null,
  perfiles: { id: USUARIOS.recepcionista, nombres: 'Lucía', apellidos: 'Herrera Gómez', rol: 'recepcionista' },
  pacientes: { id: PACIENTE_ID, nombres: 'Carlos', apellidos: 'Martínez Rivas', perfil_id: USUARIOS.paciente },
  ...cambios,
});

const solicitudPublica = (cambios: Partial<SolicitudCompleta> = {}) =>
  solicitud({
    canal: 'publico',
    solicitada_por: null,
    paciente_id: null,
    perfiles: null,
    pacientes: null,
    direccion_origen: null,
    tipo_emergencia: null,
    telefono_contacto: null,
    codigo_seguimiento: CODIGO,
    ...cambios,
  });

const ajena = () =>
  solicitud({
    solicitada_por: USUARIOS.recepcionista,
    pacientes: { id: OTRO_PACIENTE, nombres: 'Jorge', apellidos: 'Hernández Alas', perfil_id: null },
  });

const ambulancia = (activa: SolicitudCompleta | null = null): AmbulanciaConServicio => ({
  id: AMBULANCIA_ID,
  placa: 'AMB-001',
  estado: activa ? 'en_servicio' : 'disponible',
  ubicacion_actual: null,
  updated_at: new Date('2026-10-28T15:05:00Z'),
  solicitudes_ambulancia: activa ? [activa] : [],
});

const bitacora = (): BitacoraCompleta => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000081',
  ambulancia_id: AMBULANCIA_ID,
  solicitud_id: SOLICITUD_ID,
  estado_anterior: 'en_servicio',
  estado_nuevo: 'disponible',
  descripcion: 'Paciente trasladado a emergencias',
  created_at: new Date('2026-10-28T16:00:00Z'),
  registrado_por: USUARIOS.recepcionista,
  perfiles: { id: USUARIOS.recepcionista, nombres: 'Lucía', apellidos: 'Herrera Gómez' },
  solicitudes_ambulancia: solicitud({ estado: 'finalizada', fecha_cierre: new Date('2026-10-28T16:00:00Z') }),
});

/** Error tal como lo entrega Prisma ($queryRaw) cuando una función de Postgres lanza 'CODIGO: detalle'. */
const errorBd = (mensaje: string) =>
  new Error(
    `Invalid \`prisma.$queryRaw()\` invocation:\n\nRaw query failed. Code: \`PT409\`. Message: \`ERROR: ${mensaje}\``,
  );

const repo = <K extends keyof AmbulanciaRepository>(m: K) => jest.spyOn(AmbulanciaRepository.prototype, m);

beforeEach(() => limiteSolicitudPublica.reiniciar());

describe('Ambulancia API (HUNI-70)', () => {
  describe('Autenticación', () => {
    test.each([
      ['get', '/api/ambulancia'],
      ['patch', '/api/ambulancia/estado'],
      ['get', '/api/ambulancia/bitacora'],
      ['post', '/api/ambulancia/solicitudes'],
      ['get', '/api/ambulancia/solicitudes'],
      ['get', `/api/ambulancia/solicitudes/${SOLICITUD_ID}`],
      ['patch', `/api/ambulancia/solicitudes/${SOLICITUD_ID}`],
      ['post', `/api/ambulancia/solicitudes/${SOLICITUD_ID}/despachar`],
      ['post', `/api/ambulancia/solicitudes/${SOLICITUD_ID}/en-curso`],
      ['post', `/api/ambulancia/solicitudes/${SOLICITUD_ID}/cerrar`],
      ['post', `/api/ambulancia/solicitudes/${SOLICITUD_ID}/cancelar`],
    ] as const)('%s %s sin token → 401', async (method, url) => {
      const res = await request(app)[method](url).send({});

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/ambulancia', () => {
    test('recepción ve el estado y el servicio en curso', async () => {
      repo('findAmbulancia').mockResolvedValue(ambulancia(solicitud({ estado: 'despachada' })));

      const res = await request(app)
        .get('/api/ambulancia')
        .set(await sesionComo('recepcionista'));

      expect(res.status).toBe(200);
      expect(AmbulanciaSchema.safeParse(res.body.data).success).toBe(true);
      expect(res.body.data).toMatchObject({
        estado: 'en_servicio',
        solicitud_activa: { id: SOLICITUD_ID, latitud: 13.9879 },
      });
    });

    test('un paciente no ve el servicio en curso si no es suyo', async () => {
      repo('findAmbulancia').mockResolvedValue(ambulancia(ajena()));

      const res = await request(app)
        .get('/api/ambulancia')
        .set(await sesionComo('paciente'));

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ estado: 'en_servicio', solicitud_activa: null });
    });

    test('un paciente sí ve su propio servicio en curso', async () => {
      repo('findAmbulancia').mockResolvedValue(ambulancia(solicitud({ estado: 'despachada' })));

      const res = await request(app)
        .get('/api/ambulancia')
        .set(await sesionComo('paciente'));

      expect(res.body.data.solicitud_activa.id).toBe(SOLICITUD_ID);
    });
  });

  describe('PATCH /api/ambulancia/estado', () => {
    test('el administrador la pone en mantenimiento', async () => {
      const cambiar = repo('cambiarEstado').mockResolvedValue();
      repo('findAmbulancia').mockResolvedValue({ ...ambulancia(), estado: 'en_mantenimiento' });

      const res = await request(app)
        .patch('/api/ambulancia/estado')
        .set(await sesionComo('administrador'))
        .send({ estado: 'en_mantenimiento', descripcion: 'Cambio de llantas' });

      expect(res.status).toBe(200);
      expect(res.body.data.estado).toBe('en_mantenimiento');
      expect(cambiar).toHaveBeenCalledWith('en_mantenimiento', 'Cambio de llantas', USUARIOS.administrador);
    });

    test('desde en_servicio → 422 AMBULANCIA_EN_SERVICIO', async () => {
      repo('cambiarEstado').mockRejectedValue(errorBd('AMBULANCIA_EN_SERVICIO: cierra el servicio en curso'));

      const res = await request(app)
        .patch('/api/ambulancia/estado')
        .set(await sesionComo('administrador'))
        .send({ estado: 'en_mantenimiento' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('AMBULANCIA_EN_SERVICIO');
    });

    test('en_servicio no se pone a mano → 400', async () => {
      const res = await request(app)
        .patch('/api/ambulancia/estado')
        .set(await sesionComo('administrador'))
        .send({ estado: 'en_servicio' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION');
    });

    test('recepción no cambia el mantenimiento → 403', async () => {
      const res = await request(app)
        .patch('/api/ambulancia/estado')
        .set(await sesionComo('recepcionista'))
        .send({ estado: 'en_mantenimiento' });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/ambulancia/solicitudes', () => {
    test('un paciente la pide siempre a su nombre, solo con su ubicación', async () => {
      repo('findPacienteIdDePerfil').mockResolvedValue(PACIENTE_ID);
      repo('tieneSolicitudAbierta').mockResolvedValue(false);
      const crear = repo('crearSolicitud').mockResolvedValue(solicitud({ solicitada_por: USUARIOS.paciente }));

      const res = await request(app)
        .post('/api/ambulancia/solicitudes')
        .set(await sesionComo('paciente'))
        .send({ latitud: 13.9879, longitud: -89.5483, precision_m: 10, paciente_id: OTRO_PACIENTE });

      expect(res.status).toBe(201);
      expect(SolicitudAmbulanciaSchema.safeParse(res.body.data).success).toBe(true);
      expect(crear).toHaveBeenCalledWith(
        expect.objectContaining({
          canal: 'app',
          solicitada_por: USUARIOS.paciente,
          paciente_id: PACIENTE_ID,
          latitud: 13.9879,
          prioridad: 'urgente',
        }),
      );
    });

    test('un paciente con una solicitud abierta → 429 LIMITE_SOLICITUDES', async () => {
      repo('findPacienteIdDePerfil').mockResolvedValue(PACIENTE_ID);
      repo('tieneSolicitudAbierta').mockResolvedValue(true);
      const crear = repo('crearSolicitud');

      const res = await request(app)
        .post('/api/ambulancia/solicitudes')
        .set(await sesionComo('paciente'))
        .send({ direccion_origen: 'Santa Ana, centro' });

      expect(res.status).toBe(429);
      expect(res.body.code).toBe('LIMITE_SOLICITUDES');
      expect(crear).not.toHaveBeenCalled();
    });

    test('una cuenta de paciente sin ficha → 403 PERFIL_INCOMPLETO', async () => {
      repo('findPacienteIdDePerfil').mockResolvedValue(null);

      const res = await request(app)
        .post('/api/ambulancia/solicitudes')
        .set(await sesionComo('paciente'))
        .send({ direccion_origen: 'Santa Ana, centro' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERFIL_INCOMPLETO');
    });

    test('recepción la registra para otro paciente con tipo y prioridad', async () => {
      const crear = repo('crearSolicitud').mockResolvedValue(ajena());

      const res = await request(app)
        .post('/api/ambulancia/solicitudes')
        .set(await sesionComo('recepcionista'))
        .send({
          direccion_origen: 'Chalchuapa, calle principal',
          paciente_id: OTRO_PACIENTE,
          tipo_emergencia: 'neurologica',
          prioridad: 'critica',
          telefono_contacto: '+503 7000-0010',
        });

      expect(res.status).toBe(201);
      expect(crear).toHaveBeenCalledWith(
        expect.objectContaining({ paciente_id: OTRO_PACIENTE, tipo_emergencia: 'neurologica', prioridad: 'critica' }),
      );
    });

    test.each([
      ['sin dirección ni coordenadas', { descripcion_emergencia: 'Desmayo' }, 'direccion_origen'],
      ['latitud sin longitud', { latitud: 13.99 }, 'longitud'],
      ['latitud fuera de rango', { latitud: 120, longitud: -89.5 }, 'latitud'],
      [
        'tipo de emergencia desconocido',
        { direccion_origen: 'Santa Ana', tipo_emergencia: 'gripe' },
        'tipo_emergencia',
      ],
    ])('%s → 400', async (_caso, body, campo) => {
      const res = await request(app)
        .post('/api/ambulancia/solicitudes')
        .set(await sesionComo('doctor'))
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(campo);
    });

    test('el administrador no pide ambulancias → 403', async () => {
      const res = await request(app)
        .post('/api/ambulancia/solicitudes')
        .set(await sesionComo('administrador'))
        .send({ direccion_origen: 'Santa Ana' });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/ambulancia/solicitudes', () => {
    test('recepción lista con filtros (fechas en hora de El Salvador)', async () => {
      const listar = repo('listarSolicitudes').mockResolvedValue([[solicitud()], 1]);

      const res = await request(app)
        .get(
          '/api/ambulancia/solicitudes?estado=pendiente&canal=publico&tipo_emergencia=cardiaca&desde=2026-10-28&hasta=2026-10-28',
        )
        .set(await sesionComo('recepcionista'));

      expect(res.status).toBe(200);
      expect(SolicitudAmbulanciaSchema.safeParse(res.body.data.items[0]).success).toBe(true);
      expect(res.body.data.paginacion).toEqual({ pagina: 1, por_pagina: 20, total: 1, total_paginas: 1 });
      expect(listar).toHaveBeenCalledWith(
        expect.objectContaining({
          estado: 'pendiente',
          canal: 'publico',
          tipoEmergencia: 'cardiaca',
          desde: new Date('2026-10-28T06:00:00Z'),
          hastaExclusivo: new Date('2026-10-29T06:00:00Z'),
        }),
        0,
        20,
      );
      expect(listar.mock.calls[0][0].perfilPaciente).toBeUndefined();
    });

    test('un paciente solo recibe las suyas', async () => {
      const listar = repo('listarSolicitudes').mockResolvedValue([[], 0]);

      await request(app)
        .get('/api/ambulancia/solicitudes')
        .set(await sesionComo('paciente'));

      expect(listar).toHaveBeenCalledWith(expect.objectContaining({ perfilPaciente: USUARIOS.paciente }), 0, 20);
    });
  });

  describe('GET /api/ambulancia/solicitudes/:id', () => {
    test('un paciente ve la suya', async () => {
      repo('findSolicitud').mockResolvedValue(solicitud());

      const res = await request(app)
        .get(`/api/ambulancia/solicitudes/${SOLICITUD_ID}`)
        .set(await sesionComo('paciente'));

      expect(res.status).toBe(200);
      expect(res.body.data.paciente.nombres).toBe('Carlos');
    });

    test('un paciente no ve una ajena → 403', async () => {
      repo('findSolicitud').mockResolvedValue(ajena());

      const res = await request(app)
        .get(`/api/ambulancia/solicitudes/${SOLICITUD_ID}`)
        .set(await sesionComo('paciente'));

      expect(res.status).toBe(403);
    });

    test('una que no existe → 404 para el personal', async () => {
      repo('findSolicitud').mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/ambulancia/solicitudes/${SOLICITUD_ID}`)
        .set(await sesionComo('doctor'));

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/ambulancia/solicitudes/:id', () => {
    test('recepción completa los datos de una solicitud pública', async () => {
      repo('findSolicitud').mockResolvedValue(solicitudPublica({ tipo_emergencia: 'respiratoria' }));
      const actualizar = repo('actualizarAbierta').mockResolvedValue(true);

      const res = await request(app)
        .patch(`/api/ambulancia/solicitudes/${SOLICITUD_ID}`)
        .set(await sesionComo('recepcionista'))
        .send({ tipo_emergencia: 'respiratoria', prioridad: 'critica', paciente_id: PACIENTE_ID });

      expect(res.status).toBe(200);
      expect(res.body.data.canal).toBe('publico');
      expect(actualizar).toHaveBeenCalledWith(SOLICITUD_ID, {
        tipo_emergencia: 'respiratoria',
        prioridad: 'critica',
        paciente_id: PACIENTE_ID,
      });
    });

    test('una solicitud cerrada no se modifica → 409 SOLICITUD_CERRADA', async () => {
      repo('findSolicitud').mockResolvedValue(solicitud({ estado: 'finalizada' }));
      repo('actualizarAbierta').mockResolvedValue(false);

      const res = await request(app)
        .patch(`/api/ambulancia/solicitudes/${SOLICITUD_ID}`)
        .set(await sesionComo('recepcionista'))
        .send({ destino: 'Hospital San Juan de Dios' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SOLICITUD_CERRADA');
    });

    test('sin campos → 400', async () => {
      const res = await request(app)
        .patch(`/api/ambulancia/solicitudes/${SOLICITUD_ID}`)
        .set(await sesionComo('recepcionista'))
        .send({});

      expect(res.status).toBe(400);
    });

    test('un doctor no la modifica → 403', async () => {
      const res = await request(app)
        .patch(`/api/ambulancia/solicitudes/${SOLICITUD_ID}`)
        .set(await sesionComo('doctor'))
        .send({ destino: 'Otro' });

      expect(res.status).toBe(403);
    });
  });

  describe('Despacho, en curso y cierre', () => {
    test('recepción despacha: la solicitud queda despachada', async () => {
      const despachar = repo('despachar').mockResolvedValue();
      repo('findSolicitud').mockResolvedValue(solicitud({ estado: 'despachada', fecha_despacho: new Date() }));

      const res = await request(app)
        .post(`/api/ambulancia/solicitudes/${SOLICITUD_ID}/despachar`)
        .set(await sesionComo('recepcionista'));

      expect(res.status).toBe(200);
      expect(res.body.data.estado).toBe('despachada');
      expect(despachar).toHaveBeenCalledWith(SOLICITUD_ID, USUARIOS.recepcionista);
    });

    test('un segundo despacho simultáneo (o en mantenimiento) → 409 AMBULANCIA_NO_DISPONIBLE', async () => {
      repo('despachar').mockRejectedValue(errorBd('AMBULANCIA_NO_DISPONIBLE: la ambulancia está en_servicio'));

      const res = await request(app)
        .post(`/api/ambulancia/solicitudes/${SOLICITUD_ID}/despachar`)
        .set(await sesionComo('recepcionista'));

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('AMBULANCIA_NO_DISPONIBLE');
    });

    test('despachar una solicitud ya cerrada → 422 TRANSICION_INVALIDA', async () => {
      repo('despachar').mockRejectedValue(errorBd('TRANSICION_INVALIDA: la solicitud está finalizada'));

      const res = await request(app)
        .post(`/api/ambulancia/solicitudes/${SOLICITUD_ID}/despachar`)
        .set(await sesionComo('recepcionista'));

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('TRANSICION_INVALIDA');
    });

    test.each(['administrador', 'doctor', 'paciente'] as const)('%s no despacha → 403', async (rol) => {
      const res = await request(app)
        .post(`/api/ambulancia/solicitudes/${SOLICITUD_ID}/despachar`)
        .set(await sesionComo(rol));

      expect(res.status).toBe(403);
    });

    test('recepción marca en curso', async () => {
      const enCurso = repo('marcarEnCurso').mockResolvedValue();
      repo('findSolicitud').mockResolvedValue(solicitud({ estado: 'en_curso', fecha_en_curso: new Date() }));

      const res = await request(app)
        .post(`/api/ambulancia/solicitudes/${SOLICITUD_ID}/en-curso`)
        .set(await sesionComo('recepcionista'));

      expect(res.status).toBe(200);
      expect(res.body.data.estado).toBe('en_curso');
      expect(enCurso).toHaveBeenCalledWith(SOLICITUD_ID);
    });

    test('recepción cierra el servicio con su descripción', async () => {
      const cerrar = repo('cerrar').mockResolvedValue();
      repo('findSolicitud').mockResolvedValue(
        solicitud({ estado: 'finalizada', fecha_cierre: new Date(), notas_cierre: 'Trasladado a emergencias' }),
      );

      const res = await request(app)
        .post(`/api/ambulancia/solicitudes/${SOLICITUD_ID}/cerrar`)
        .set(await sesionComo('recepcionista'))
        .send({ descripcion: 'Trasladado a emergencias' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ estado: 'finalizada', notas_cierre: 'Trasladado a emergencias' });
      expect(cerrar).toHaveBeenCalledWith(SOLICITUD_ID, 'Trasladado a emergencias', USUARIOS.recepcionista);
    });
  });

  describe('POST /api/ambulancia/solicitudes/:id/cancelar', () => {
    test('un paciente cancela su solicitud pendiente (sin poder cancelar una despachada)', async () => {
      repo('findSolicitud').mockResolvedValue(solicitud());
      const cancelar = repo('cancelar').mockResolvedValue();

      const res = await request(app)
        .post(`/api/ambulancia/solicitudes/${SOLICITUD_ID}/cancelar`)
        .set(await sesionComo('paciente'))
        .send({ motivo: 'Ya me siento mejor' });

      expect(res.status).toBe(200);
      expect(cancelar).toHaveBeenCalledWith(SOLICITUD_ID, 'Ya me siento mejor', USUARIOS.paciente, false);
    });

    test('un paciente no cancela una ajena → 403', async () => {
      repo('findSolicitud').mockResolvedValue(ajena());
      const cancelar = repo('cancelar');

      const res = await request(app)
        .post(`/api/ambulancia/solicitudes/${SOLICITUD_ID}/cancelar`)
        .set(await sesionComo('paciente'))
        .send({});

      expect(res.status).toBe(403);
      expect(cancelar).not.toHaveBeenCalled();
    });

    test('recepción cancela una despachada (falsa alarma) con motivo', async () => {
      repo('findSolicitud').mockResolvedValue(solicitud({ estado: 'despachada' }));
      const cancelar = repo('cancelar').mockResolvedValue();

      const res = await request(app)
        .post(`/api/ambulancia/solicitudes/${SOLICITUD_ID}/cancelar`)
        .set(await sesionComo('recepcionista'))
        .send({ motivo: 'Falsa alarma' });

      expect(res.status).toBe(200);
      expect(cancelar).toHaveBeenCalledWith(SOLICITUD_ID, 'Falsa alarma', USUARIOS.recepcionista, true);
    });

    test('cancelar una despachada sin motivo → 400', async () => {
      repo('findSolicitud').mockResolvedValue(solicitud({ estado: 'en_curso' }));
      const cancelar = repo('cancelar');

      const res = await request(app)
        .post(`/api/ambulancia/solicitudes/${SOLICITUD_ID}/cancelar`)
        .set(await sesionComo('administrador'))
        .send({});

      expect(res.status).toBe(400);
      expect(cancelar).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/ambulancia/bitacora', () => {
    test('un doctor la consulta con filtros', async () => {
      const listar = repo('listarBitacora').mockResolvedValue([[bitacora()], 1]);

      const res = await request(app)
        .get('/api/ambulancia/bitacora?estado=disponible&prioridad=critica&tipo_emergencia=cardiaca&desde=2026-10-01')
        .set(await sesionComo('doctor'));

      expect(res.status).toBe(200);
      expect(BitacoraAmbulanciaSchema.safeParse(res.body.data.items[0]).success).toBe(true);
      expect(res.body.data.items[0]).toMatchObject({
        registrado_por: { nombres: 'Lucía' },
        solicitud: { paciente: { nombres: 'Carlos' }, tipo_emergencia: 'cardiaca' },
      });
      expect(listar).toHaveBeenCalledWith(
        expect.objectContaining({
          estado: 'disponible',
          prioridad: 'critica',
          tipoEmergencia: 'cardiaca',
          desde: new Date('2026-10-01T06:00:00Z'),
        }),
        0,
        20,
      );
    });

    test('un paciente no ve la bitácora → 403', async () => {
      const res = await request(app)
        .get('/api/ambulancia/bitacora')
        .set(await sesionComo('paciente'));

      expect(res.status).toBe(403);
    });
  });

  describe('Botón público del login (/api/publico/ambulancia)', () => {
    test('sin sesión y solo con la ubicación → 201 con su código de seguimiento', async () => {
      repo('contarPendientesPublicas').mockResolvedValue(0);
      const crear = repo('crearSolicitud').mockResolvedValue(solicitudPublica());

      const res = await request(app)
        .post('/api/publico/ambulancia/solicitudes')
        .send({ latitud: 13.9941, longitud: -89.5569, precision_m: 30 });

      expect(res.status).toBe(201);
      expect(SeguimientoSolicitudPublicaSchema.safeParse(res.body.data).success).toBe(true);
      expect(res.body.data).toEqual(expect.objectContaining({ codigo_seguimiento: CODIGO, estado: 'pendiente' }));
      expect(res.body.data).not.toHaveProperty('latitud');
      const datos = crear.mock.calls[0][0];
      expect(datos).toMatchObject({ canal: 'publico', latitud: 13.9941 });
      expect(datos.codigo_seguimiento).toMatch(/^[A-Za-z0-9_-]{24}$/);
      expect(datos).not.toHaveProperty('solicitada_por');
    });

    test('sin ubicación → 400', async () => {
      const res = await request(app)
        .post('/api/publico/ambulancia/solicitudes')
        .send({ telefono_contacto: '+503 7000-0000' });

      expect(res.status).toBe(400);
    });

    test('más de 3 solicitudes desde la misma IP en 15 minutos → 429', async () => {
      repo('contarPendientesPublicas').mockResolvedValue(0);
      repo('crearSolicitud').mockResolvedValue(solicitudPublica());
      const enviar = () =>
        request(app).post('/api/publico/ambulancia/solicitudes').send({ latitud: 13.99, longitud: -89.55 });

      for (let i = 0; i < 3; i++) expect((await enviar()).status).toBe(201);
      const res = await enviar();

      expect(res.status).toBe(429);
      expect(res.body.code).toBe('LIMITE_SOLICITUDES');
      expect(res.headers['retry-after']).toBeDefined();
    });

    test('con 5 públicas pendientes → 429', async () => {
      repo('contarPendientesPublicas').mockResolvedValue(5);
      const crear = repo('crearSolicitud');

      const res = await request(app)
        .post('/api/publico/ambulancia/solicitudes')
        .send({ direccion_origen: 'Parque Libertad' });

      expect(res.status).toBe(429);
      expect(crear).not.toHaveBeenCalled();
    });

    test('seguimiento por código: solo estado y horas', async () => {
      repo('findPorCodigo').mockResolvedValue(solicitudPublica({ estado: 'despachada', fecha_despacho: new Date() }));

      const res = await request(app).get(`/api/publico/ambulancia/solicitudes/${CODIGO}`);

      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data).sort()).toEqual(
        [
          'codigo_seguimiento',
          'estado',
          'fecha_cierre',
          'fecha_despacho',
          'fecha_en_curso',
          'fecha_solicitud',
          'tiene_contacto',
        ].sort(),
      );
      expect(res.body.data.estado).toBe('despachada');
    });

    test('un código que no existe → 404', async () => {
      repo('findPorCodigo').mockResolvedValue(null);

      const res = await request(app).get('/api/publico/ambulancia/solicitudes/codigo-que-no-existe-0000');

      expect(res.status).toBe(404);
    });

    test('un código con caracteres raros → 400', async () => {
      const res = await request(app).get('/api/publico/ambulancia/solicitudes/abc');

      expect(res.status).toBe(400);
    });

    test('agrega su teléfono después', async () => {
      repo('findPorCodigo')
        .mockResolvedValueOnce(solicitudPublica())
        .mockResolvedValueOnce(solicitudPublica({ telefono_contacto: '+503 7000-0099' }));
      const actualizar = repo('actualizarAbierta').mockResolvedValue(true);

      const res = await request(app)
        .patch(`/api/publico/ambulancia/solicitudes/${CODIGO}`)
        .send({ telefono_contacto: '+503 7000-0099', nombre_contacto: 'Mario' });

      expect(res.status).toBe(200);
      expect(res.body.data.tiene_contacto).toBe(true);
      expect(actualizar).toHaveBeenCalledWith(SOLICITUD_ID, {
        telefono_contacto: '+503 7000-0099',
        nombre_contacto: 'Mario',
      });
    });

    test('no se completan datos de una solicitud cerrada → 409', async () => {
      repo('findPorCodigo').mockResolvedValue(solicitudPublica({ estado: 'finalizada' }));
      repo('actualizarAbierta').mockResolvedValue(false);

      const res = await request(app)
        .patch(`/api/publico/ambulancia/solicitudes/${CODIGO}`)
        .send({ descripcion_emergencia: 'Crisis de asma' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SOLICITUD_CERRADA');
    });

    test('"Ya no la necesito": cancela aunque ya vaya en camino', async () => {
      repo('findPorCodigo')
        .mockResolvedValueOnce(solicitudPublica({ estado: 'despachada' }))
        .mockResolvedValueOnce(solicitudPublica({ estado: 'cancelada' }));
      const cancelar = repo('cancelar').mockResolvedValue();

      const res = await request(app).post(`/api/publico/ambulancia/solicitudes/${CODIGO}/cancelar`).send({});

      expect(res.status).toBe(200);
      expect(res.body.data.estado).toBe('cancelada');
      expect(cancelar).toHaveBeenCalledWith(SOLICITUD_ID, 'Cancelada por quien la pidió', null, true);
    });

    test('cancelar una ya cerrada → 422 TRANSICION_INVALIDA', async () => {
      repo('findPorCodigo').mockResolvedValue(solicitudPublica({ estado: 'finalizada' }));
      repo('cancelar').mockRejectedValue(errorBd('TRANSICION_INVALIDA: la solicitud está finalizada'));

      const res = await request(app).post(`/api/publico/ambulancia/solicitudes/${CODIGO}/cancelar`).send({});

      expect(res.status).toBe(422);
    });
  });
});
