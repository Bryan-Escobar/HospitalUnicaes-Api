import request from 'supertest';
import { ProveedorSchema } from '../../src/domain/dtos/proveedores.dto';
import { Rol } from '../../src/domain/dtos/enums';
import { Proveedor, ProveedoresRepository } from '../../src/repositories/proveedores.repository';
import { app } from '../helpers/app';
import { sesionComo } from '../helpers/auth';

const PROV_ID = 'cccccccc-0000-4000-8000-000000000001';

const proveedor = (extra: Partial<Proveedor> = {}): Proveedor => ({
  id: PROV_ID,
  nombre: 'Distribuidora Médica Demo, S.A. de C.V.',
  nit: '0614-010190-101-0',
  nrc: '100001-1',
  contacto: 'Sofía Alvarado',
  telefono: '+503 2200-0001',
  email: 'ventas@distribuidora-demo.test',
  direccion: 'San Salvador',
  activo: true,
  created_at: new Date('2026-10-24T00:00:00Z'),
  updated_at: new Date('2026-10-24T00:00:00Z'),
  ...extra,
});

const repo = <K extends keyof ProveedoresRepository>(m: K) => jest.spyOn(ProveedoresRepository.prototype, m);

describe('Proveedores API', () => {
  test('401 sin token', async () => {
    const res = await request(app).get('/api/proveedores');
    expect(res.status).toBe(401);
  });

  test.each(['doctor', 'recepcionista', 'paciente'] as Rol[])('%s no gestiona proveedores → 403', async (rol) => {
    const headers = await sesionComo(rol);
    const lectura = await request(app).get('/api/proveedores').set(headers);
    const escritura = await request(app).post('/api/proveedores').set(headers).send({ nombre: 'x' });
    expect(lectura.status).toBe(403);
    expect(escritura.status).toBe(403);
  });

  describe('GET', () => {
    test('lista paginada con búsqueda y filtro de activo', async () => {
      const listar = repo('listar').mockResolvedValue([[proveedor()], 1]);

      const res = await request(app)
        .get('/api/proveedores?buscar=demo&activo=true')
        .set(await sesionComo('administrador'));

      expect(res.status).toBe(200);
      expect(ProveedorSchema.safeParse(res.body.data.items[0]).success).toBe(true);
      expect(listar).toHaveBeenCalledWith({ buscar: 'demo', activo: true }, 0, 20);
    });

    test('detalle y 404', async () => {
      const headers = await sesionComo('administrador');
      repo('findById').mockResolvedValueOnce(proveedor()).mockResolvedValueOnce(null);
      const ok = await request(app).get(`/api/proveedores/${PROV_ID}`).set(headers);
      const no = await request(app).get(`/api/proveedores/${PROV_ID}`).set(headers);
      expect(ok.status).toBe(200);
      expect(no.status).toBe(404);
    });
  });

  describe('POST', () => {
    test('201', async () => {
      const crear = repo('crear').mockResolvedValue(proveedor());
      const body = { nombre: 'Farmacéutica Demo', nit: '0614-030390-103-2', nrc: '100003-3', email: 'a@b.test' };

      const res = await request(app)
        .post('/api/proveedores')
        .set(await sesionComo('administrador'))
        .send(body);

      expect(res.status).toBe(201);
      expect(crear).toHaveBeenCalledWith(body);
    });

    test('NIT, NRC o correo con mal formato → 400 con el campo', async () => {
      const headers = await sesionComo('administrador');
      for (const [campo, valor] of [
        ['nit', '123'],
        ['nrc', 'abc'],
        ['email', 'no-es-correo'],
      ]) {
        const res = await request(app)
          .post('/api/proveedores')
          .set(headers)
          .send({ nombre: 'X', [campo]: valor });
        expect(res.status).toBe(400);
        expect(res.body.errors[0].field).toBe(campo);
      }
    });

    test('NIT duplicado → 409 REGISTRO_DUPLICADO', async () => {
      repo('crear').mockRejectedValue(Object.assign(new Error('Unique'), { code: 'P2002' }));
      const res = await request(app)
        .post('/api/proveedores')
        .set(await sesionComo('administrador'))
        .send({ nombre: 'X', nit: '0614-010190-101-0' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('REGISTRO_DUPLICADO');
    });

    test('campo desconocido → 400', async () => {
      const res = await request(app)
        .post('/api/proveedores')
        .set(await sesionComo('administrador'))
        .send({ nombre: 'X', saldo: 10 });
      expect(res.status).toBe(400);
      expect(res.body.errors[0].field).toBe('saldo');
    });
  });

  describe('PATCH y DELETE', () => {
    test('PATCH reactiva', async () => {
      repo('findById').mockResolvedValue(proveedor({ activo: false }));
      const actualizar = repo('actualizar').mockResolvedValue(proveedor());

      const res = await request(app)
        .patch(`/api/proveedores/${PROV_ID}`)
        .set(await sesionComo('administrador'))
        .send({ activo: true });

      expect(res.status).toBe(200);
      expect(actualizar).toHaveBeenCalledWith(PROV_ID, { activo: true });
    });

    test('PATCH vacío → 400', async () => {
      const res = await request(app)
        .patch(`/api/proveedores/${PROV_ID}`)
        .set(await sesionComo('administrador'))
        .send({});
      expect(res.status).toBe(400);
    });

    test('DELETE desactiva, no borra', async () => {
      repo('findById').mockResolvedValue(proveedor());
      const actualizar = repo('actualizar').mockResolvedValue(proveedor({ activo: false }));

      const res = await request(app)
        .delete(`/api/proveedores/${PROV_ID}`)
        .set(await sesionComo('administrador'));

      expect(res.status).toBe(200);
      expect(res.body.data.activo).toBe(false);
      expect(actualizar).toHaveBeenCalledWith(PROV_ID, { activo: false });
    });

    test('DELETE de uno ya inactivo no vuelve a escribir', async () => {
      repo('findById').mockResolvedValue(proveedor({ activo: false }));
      const actualizar = repo('actualizar');
      const res = await request(app)
        .delete(`/api/proveedores/${PROV_ID}`)
        .set(await sesionComo('administrador'));
      expect(res.status).toBe(200);
      expect(actualizar).not.toHaveBeenCalled();
    });
  });
});
