import request from 'supertest';
import { ActivoSchema } from '../../src/domain/dtos/activos.dto';
import { Rol } from '../../src/domain/dtos/enums';
import { ActivoCompleto, ActivosRepository } from '../../src/repositories/activos.repository';
import { app } from '../helpers/app';
import { sesionComo, USUARIOS } from '../helpers/auth';

const ACTIVO_ID = 'eeeeeeee-0000-4000-8000-000000000001';
const ITEM_ID = 'aaaaaaaa-0000-4000-8000-000000000005';
const PROV_ID = 'cccccccc-0000-4000-8000-000000000002';

const activo = (extra: Partial<ActivoCompleto> = {}): ActivoCompleto => ({
  id: ACTIVO_ID,
  item_id: ITEM_ID,
  numero_serie: 'MSV-10001',
  proveedor_id: PROV_ID,
  estado: 'en_uso',
  ubicacion: 'VIP-301',
  fecha_ingreso: new Date('2026-10-24T00:00:00Z'),
  notas: null,
  registrado_por: USUARIOS.administrador,
  created_at: new Date('2026-10-24T00:00:00Z'),
  updated_at: new Date('2026-10-24T00:00:00Z'),
  inventario_items: { id: ITEM_ID, codigo: 'EQP-0001', nombre: 'Monitor de signos vitales' },
  proveedores: { id: PROV_ID, nombre: 'Equipos Hospitalarios Demo' },
  perfiles: { id: USUARIOS.administrador, nombres: 'Andrea', apellidos: 'Méndez Ruiz' },
  ...extra,
});

const repo = <K extends keyof ActivosRepository>(m: K) => jest.spyOn(ActivosRepository.prototype, m);
const errorBd = (code: string) => new Error(`ERROR: ${code}: detalle de la base de datos`);

describe('Activos API', () => {
  test('401 sin token', async () => {
    const res = await request(app).get('/api/activos');
    expect(res.status).toBe(401);
  });

  test.each(['doctor', 'recepcionista', 'paciente'] as Rol[])('%s → 403', async (rol) => {
    const headers = await sesionComo(rol);
    const lectura = await request(app).get('/api/activos').set(headers);
    const escritura = await request(app).patch(`/api/activos/${ACTIVO_ID}`).set(headers).send({ notas: 'x' });
    expect(lectura.status).toBe(403);
    expect(escritura.status).toBe(403);
  });

  describe('GET', () => {
    test('lista con filtros', async () => {
      const listar = repo('listar').mockResolvedValue([[activo()], 1]);

      const res = await request(app)
        .get(`/api/activos?item_id=${ITEM_ID}&estado=en_uso&buscar=MSV`)
        .set(await sesionComo('administrador'));

      expect(res.status).toBe(200);
      expect(ActivoSchema.safeParse(res.body.data.items[0]).success).toBe(true);
      expect(res.body.data.items[0]).toMatchObject({ fecha_ingreso: '2026-10-24', item: { codigo: 'EQP-0001' } });
      expect(listar).toHaveBeenCalledWith({ item_id: ITEM_ID, estado: 'en_uso', buscar: 'MSV' }, 0, 20);
    });

    test('detalle y 404', async () => {
      const headers = await sesionComo('administrador');
      repo('findById').mockResolvedValueOnce(activo()).mockResolvedValueOnce(null);
      expect((await request(app).get(`/api/activos/${ACTIVO_ID}`).set(headers)).status).toBe(200);
      expect((await request(app).get(`/api/activos/${ACTIVO_ID}`).set(headers)).status).toBe(404);
    });
  });

  describe('POST', () => {
    const body = { item_id: ITEM_ID, numero_serie: 'MSV-10003', proveedor_id: PROV_ID, ubicacion: 'Biomédica' };

    test('201 a nombre de la sesión, estado disponible por defecto', async () => {
      const crear = repo('crear').mockResolvedValue(activo({ estado: 'disponible' }));

      const res = await request(app)
        .post('/api/activos')
        .set(await sesionComo('administrador'))
        .send(body);

      expect(res.status).toBe(201);
      expect(crear).toHaveBeenCalledWith(
        { ...body, estado: 'disponible', fecha_ingreso: undefined },
        USUARIOS.administrador,
      );
    });

    test('no se registra ya dado de baja → 400', async () => {
      const res = await request(app)
        .post('/api/activos')
        .set(await sesionComo('administrador'))
        .send({ ...body, estado: 'dado_de_baja' });
      expect(res.status).toBe(400);
    });

    test.each([
      ['TIPO_CONTROL_INVALIDO', 422],
      ['PROVEEDOR_INVALIDO', 422],
      ['ITEM_INACTIVO', 422],
    ])('error de la BD %s → %i', async (code, status) => {
      repo('crear').mockRejectedValue(errorBd(code));
      const res = await request(app)
        .post('/api/activos')
        .set(await sesionComo('administrador'))
        .send(body);
      expect(res.status).toBe(status);
      expect(res.body.code).toBe(code);
    });

    test('número de serie repetido → 409', async () => {
      repo('crear').mockRejectedValue(Object.assign(new Error('Unique'), { code: 'P2002' }));
      const res = await request(app)
        .post('/api/activos')
        .set(await sesionComo('administrador'))
        .send(body);
      expect(res.status).toBe(409);
    });
  });

  describe('PATCH', () => {
    test('cambia estado, ubicación y notas', async () => {
      repo('findById').mockResolvedValue(activo());
      const actualizar = repo('actualizar').mockResolvedValue(activo({ estado: 'en_mantenimiento' }));

      const res = await request(app)
        .patch(`/api/activos/${ACTIVO_ID}`)
        .set(await sesionComo('administrador'))
        .send({ estado: 'en_mantenimiento', ubicacion: 'Taller', notas: 'Calibración' });

      expect(res.status).toBe(200);
      expect(actualizar).toHaveBeenCalledWith(ACTIVO_ID, {
        estado: 'en_mantenimiento',
        ubicacion: 'Taller',
        notas: 'Calibración',
      });
    });

    test('dado de baja ya no se modifica → 409 ACTIVO_DADO_DE_BAJA', async () => {
      repo('findById').mockResolvedValue(activo({ estado: 'dado_de_baja' }));
      repo('actualizar').mockRejectedValue(errorBd('ACTIVO_DADO_DE_BAJA'));
      const res = await request(app)
        .patch(`/api/activos/${ACTIVO_ID}`)
        .set(await sesionComo('administrador'))
        .send({ notas: 'x' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ACTIVO_DADO_DE_BAJA');
    });

    test('numero_serie o item_id no se editan → 400 con el campo', async () => {
      const res = await request(app)
        .patch(`/api/activos/${ACTIVO_ID}`)
        .set(await sesionComo('administrador'))
        .send({ numero_serie: 'OTRO', item_id: ITEM_ID });
      expect(res.status).toBe(400);
      expect(res.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(['item_id', 'numero_serie']);
    });
  });
});
