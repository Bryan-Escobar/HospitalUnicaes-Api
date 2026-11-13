import request from 'supertest';
import { AvisoSchema } from '../../src/domain/dtos/avisos.dto';
import { AvisoConAutor, AvisosRepository } from '../../src/repositories/avisos.repository';
import { app } from '../helpers/app';
import { sesionComo, USUARIOS } from '../helpers/auth';

const AVISO_ID = '3f1c2a9e-7b4d-4c1e-9f0a-2d6b8e5c1a7f';
const DIA = 24 * 60 * 60 * 1000;

const aviso = (extra: Partial<AvisoConAutor> = {}): AvisoConAutor => ({
  id: AVISO_ID,
  titulo: 'Jornada de vacunación',
  contenido: 'Este sábado de 8:00 a 12:00.',
  autor_id: USUARIOS.administrador,
  es_publico: true,
  fecha_publicacion: new Date(Date.now() - DIA),
  fecha_expiracion: null,
  perfiles: { id: USUARIOS.administrador, nombres: 'Andrea', apellidos: 'Méndez Ruiz' },
  ...extra,
});

const repo = <K extends keyof AvisosRepository>(metodo: K) => jest.spyOn(AvisosRepository.prototype, metodo);

describe('Avisos API', () => {
  describe('Autenticación', () => {
    test('401 sin token', async () => {
      const res = await request(app).get('/api/avisos');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_AUTENTICADO');
    });
  });

  describe('GET /api/avisos', () => {
    test('200 paginado con el formato del contrato', async () => {
      const listar = repo('listar').mockResolvedValue([[aviso()], 1]);

      const res = await request(app)
        .get('/api/avisos')
        .set(await sesionComo('doctor'));

      expect(res.status).toBe(200);
      expect(AvisoSchema.safeParse(res.body.data.items[0]).success).toBe(true);
      expect(res.body.data.items[0]).toMatchObject({ vigencia: 'vigente', autor: { nombres: 'Andrea' } });
      expect(res.body.data.paginacion).toEqual({ pagina: 1, por_pagina: 20, total: 1, total_paginas: 1 });
      expect(listar).toHaveBeenCalledWith(expect.objectContaining({ vigencia: 'vigentes' }), 0, 20);
    });

    test('el personal ve públicos e internos (sin filtro de es_publico)', async () => {
      const listar = repo('listar').mockResolvedValue([[], 0]);

      await request(app)
        .get('/api/avisos')
        .set(await sesionComo('recepcionista'));

      expect(listar.mock.calls[0][0].es_publico).toBeUndefined();
    });

    test('un paciente solo recibe avisos públicos', async () => {
      const listar = repo('listar').mockResolvedValue([[], 0]);

      await request(app)
        .get('/api/avisos')
        .set(await sesionComo('paciente'));

      expect(listar.mock.calls[0][0].es_publico).toBe(true);
    });

    test('un paciente que pide los internos → 403', async () => {
      const res = await request(app)
        .get('/api/avisos?es_publico=false')
        .set(await sesionComo('paciente'));

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCESO_DENEGADO');
    });

    test('programados o vencidos: solo el administrador', async () => {
      repo('listar').mockResolvedValue([[aviso({ fecha_publicacion: new Date(Date.now() + DIA) })], 1]);

      const doctor = await request(app)
        .get('/api/avisos?vigencia=todos')
        .set(await sesionComo('doctor'));
      const admin = await request(app)
        .get('/api/avisos?vigencia=programados')
        .set(await sesionComo('administrador'));

      expect(doctor.status).toBe(403);
      expect(admin.status).toBe(200);
      expect(admin.body.data.items[0].vigencia).toBe('programado');
    });

    test('400 con una vigencia que no existe', async () => {
      const res = await request(app)
        .get('/api/avisos?vigencia=antiguos')
        .set(await sesionComo('administrador'));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION');
    });
  });

  describe('GET /api/avisos/:id', () => {
    test('el personal ve un aviso interno vigente', async () => {
      repo('findById').mockResolvedValue(aviso({ es_publico: false }));

      const res = await request(app)
        .get(`/api/avisos/${AVISO_ID}`)
        .set(await sesionComo('doctor'));

      expect(res.status).toBe(200);
      expect(res.body.data.es_publico).toBe(false);
    });

    test('un paciente no ve un aviso interno: 404 sin revelar que existe', async () => {
      repo('findById').mockResolvedValue(aviso({ es_publico: false }));

      const res = await request(app)
        .get(`/api/avisos/${AVISO_ID}`)
        .set(await sesionComo('paciente'));

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NO_ENCONTRADO');
    });

    test('un vencido lo ve el administrador, el resto recibe 404', async () => {
      repo('findById').mockResolvedValue(
        aviso({ fecha_publicacion: new Date(Date.now() - 10 * DIA), fecha_expiracion: new Date(Date.now() - DIA) }),
      );

      const admin = await request(app)
        .get(`/api/avisos/${AVISO_ID}`)
        .set(await sesionComo('administrador'));
      const recepcion = await request(app)
        .get(`/api/avisos/${AVISO_ID}`)
        .set(await sesionComo('recepcionista'));

      expect(admin.status).toBe(200);
      expect(admin.body.data.vigencia).toBe('vencido');
      expect(recepcion.status).toBe(404);
    });

    test('400 si el id no es un UUID', async () => {
      const res = await request(app)
        .get('/api/avisos/abc')
        .set(await sesionComo('administrador'));

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/avisos', () => {
    const body = { titulo: 'Horario de visitas', contenido: 'De 10:00 a 12:00 y de 16:00 a 18:00.' };

    test('201: el administrador publica; es público por defecto y el autor es la sesión', async () => {
      const crear = repo('crear').mockResolvedValue(aviso({ titulo: body.titulo }));

      const res = await request(app)
        .post('/api/avisos')
        .set(await sesionComo('administrador'))
        .send(body);

      expect(res.status).toBe(201);
      expect(AvisoSchema.safeParse(res.body.data).success).toBe(true);
      expect(crear).toHaveBeenCalledWith(
        USUARIOS.administrador,
        expect.objectContaining({ titulo: body.titulo, es_publico: true, fecha_publicacion: expect.any(Date) }),
      );
    });

    test('se puede programar con una fecha futura', async () => {
      const crear = repo('crear').mockResolvedValue(aviso());

      await request(app)
        .post('/api/avisos')
        .set(await sesionComo('administrador'))
        .send({ ...body, es_publico: false, fecha_publicacion: '2030-01-01T08:00:00-06:00' });

      expect(crear.mock.calls[0][1]).toMatchObject({
        es_publico: false,
        fecha_publicacion: new Date('2030-01-01T14:00:00Z'),
      });
    });

    test('400 si la expiración no es posterior a la publicación', async () => {
      const res = await request(app)
        .post('/api/avisos')
        .set(await sesionComo('administrador'))
        .send({ ...body, fecha_publicacion: '2026-12-10T08:00:00Z', fecha_expiracion: '2026-12-01T08:00:00Z' });

      expect(res.status).toBe(400);
      expect(res.body.errors[0].field).toBe('fecha_expiracion');
    });

    test('422 si solo envía una expiración que ya pasó', async () => {
      const res = await request(app)
        .post('/api/avisos')
        .set(await sesionComo('administrador'))
        .send({ ...body, fecha_expiracion: '2020-01-01T00:00:00Z' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('REGLA_DE_NEGOCIO');
    });

    test('400 sin título', async () => {
      const res = await request(app)
        .post('/api/avisos')
        .set(await sesionComo('administrador'))
        .send({ contenido: 'x' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION');
    });

    test.each(['doctor', 'recepcionista', 'paciente'] as const)('%s no publica avisos → 403', async (rol) => {
      const res = await request(app)
        .post('/api/avisos')
        .set(await sesionComo(rol))
        .send(body);

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/avisos/:id', () => {
    test('200: actualiza solo lo enviado y puede quitar la expiración', async () => {
      repo('findById').mockResolvedValue(aviso({ fecha_expiracion: new Date(Date.now() + DIA) }));
      const actualizar = repo('actualizar').mockResolvedValue(aviso({ titulo: 'Nuevo' }));

      const res = await request(app)
        .patch(`/api/avisos/${AVISO_ID}`)
        .set(await sesionComo('administrador'))
        .send({ titulo: 'Nuevo', fecha_expiracion: null });

      expect(res.status).toBe(200);
      expect(actualizar).toHaveBeenCalledWith(
        AVISO_ID,
        expect.objectContaining({ titulo: 'Nuevo', fecha_expiracion: null }),
      );
      expect(actualizar.mock.calls[0][1].contenido).toBeUndefined();
    });

    test('422 si la nueva expiración queda antes de la publicación guardada', async () => {
      repo('findById').mockResolvedValue(aviso({ fecha_publicacion: new Date('2026-11-10T00:00:00Z') }));

      const res = await request(app)
        .patch(`/api/avisos/${AVISO_ID}`)
        .set(await sesionComo('administrador'))
        .send({ fecha_expiracion: '2026-11-01T00:00:00Z' });

      expect(res.status).toBe(422);
    });

    test('400 con el cuerpo vacío', async () => {
      const res = await request(app)
        .patch(`/api/avisos/${AVISO_ID}`)
        .set(await sesionComo('administrador'))
        .send({});

      expect(res.status).toBe(400);
    });

    test('404 si no existe', async () => {
      repo('findById').mockResolvedValue(null);

      const res = await request(app)
        .patch(`/api/avisos/${AVISO_ID}`)
        .set(await sesionComo('administrador'))
        .send({ titulo: 'x' });

      expect(res.status).toBe(404);
    });

    test('doctor → 403', async () => {
      const res = await request(app)
        .patch(`/api/avisos/${AVISO_ID}`)
        .set(await sesionComo('doctor'))
        .send({ titulo: 'x' });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/avisos/:id', () => {
    test('200: el administrador lo elimina', async () => {
      repo('findById').mockResolvedValue(aviso());
      const eliminar = repo('eliminar').mockResolvedValue();

      const res = await request(app)
        .delete(`/api/avisos/${AVISO_ID}`)
        .set(await sesionComo('administrador'));

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ id: AVISO_ID });
      expect(eliminar).toHaveBeenCalledWith(AVISO_ID);
    });

    test('404 si no existe', async () => {
      repo('findById').mockResolvedValue(null);

      const res = await request(app)
        .delete(`/api/avisos/${AVISO_ID}`)
        .set(await sesionComo('administrador'));

      expect(res.status).toBe(404);
    });

    test('recepcionista → 403', async () => {
      const res = await request(app)
        .delete(`/api/avisos/${AVISO_ID}`)
        .set(await sesionComo('recepcionista'));

      expect(res.status).toBe(403);
    });
  });
});
