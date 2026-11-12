import request from 'supertest';
import {
  ItemInventarioSchema,
  LoteSchema,
  LotesPorVencerSchema,
  MovimientoSchema,
} from '../../src/domain/dtos/inventario.dto';
import { Rol } from '../../src/domain/dtos/enums';
import {
  FilaLotePorVencer,
  InventarioRepository,
  Item,
  Lote,
  MovimientoCompleto,
} from '../../src/repositories/inventario.repository';
import { app } from '../helpers/app';
import { sesionComo, USUARIOS } from '../helpers/auth';

const ITEM_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const LOTE_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const PROV_ID = 'cccccccc-0000-4000-8000-000000000001';
const MOV_ID = 'dddddddd-0000-4000-8000-000000000001';
const DIA = 24 * 60 * 60 * 1000;

const fechaDb = (dias: number) => {
  const hoy = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return new Date(new Date(`${hoy}T00:00:00Z`).getTime() + dias * DIA);
};

const item = (extra: Partial<Item> = {}): Item => ({
  id: ITEM_ID,
  codigo: 'MED-0001',
  nombre: 'Paracetamol 500 mg',
  categoria: 'medicamento',
  unidad_medida: 'tableta',
  stock_actual: 150,
  stock_minimo: 200,
  ubicacion: 'Farmacia',
  activo: true,
  ...extra,
});

const lote = (dias: number, extra: Partial<Lote> = {}): Lote => ({
  id: LOTE_ID,
  item_id: ITEM_ID,
  numero_lote: 'PCT-2401',
  fecha_caducidad: fechaDb(dias),
  cantidad_actual: 120,
  created_at: new Date(),
  ...extra,
});

const movimiento = (extra: Partial<MovimientoCompleto> = {}): MovimientoCompleto => ({
  id: MOV_ID,
  item_id: ITEM_ID,
  tipo: 'salida',
  cantidad: 20,
  motivo: 'Entrega a Emergencia',
  registrado_por: USUARIOS.administrador,
  created_at: new Date('2026-11-12T15:00:00Z'),
  lote_id: LOTE_ID,
  proveedor_id: null,
  inventario_items: { id: ITEM_ID, codigo: 'MED-0001', nombre: 'Paracetamol 500 mg', stock_actual: 130 },
  lotes_inventario: { id: LOTE_ID, numero_lote: 'PCT-2401', fecha_caducidad: fechaDb(10), cantidad_actual: 100 },
  proveedores: null,
  perfiles: { id: USUARIOS.administrador, nombres: 'Andrea', apellidos: 'Méndez Ruiz' },
  ...extra,
});

const repo = <K extends keyof InventarioRepository>(m: K) => jest.spyOn(InventarioRepository.prototype, m);
const errorBd = (code: string) => new Error(`ERROR: ${code}: detalle de la base de datos`);

describe('Inventario API', () => {
  describe('Autenticación y roles', () => {
    test('401 sin token', async () => {
      const res = await request(app).get('/api/inventario');
      expect(res.status).toBe(401);
    });

    test.each(['paciente'] as Rol[])('%s no lee existencias → 403', async (rol) => {
      const res = await request(app)
        .get('/api/inventario')
        .set(await sesionComo(rol));
      expect(res.status).toBe(403);
    });

    test.each([
      ['post', '/api/inventario'],
      ['patch', `/api/inventario/${ITEM_ID}`],
      ['delete', `/api/inventario/${ITEM_ID}`],
      ['post', `/api/inventario/${ITEM_ID}/entradas`],
      ['post', `/api/inventario/${ITEM_ID}/salidas`],
      ['post', `/api/inventario/${ITEM_ID}/ajustes`],
      ['get', '/api/inventario/movimientos'],
      ['get', '/api/inventario/lotes-por-vencer'],
    ] as const)('doctor y recepción no pueden %s %s → 403', async (method, path) => {
      for (const rol of ['doctor', 'recepcionista'] as Rol[]) {
        const res = await request(app)
          [method](path)
          .set(await sesionComo(rol))
          .send({});
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('ACCESO_DENEGADO');
      }
    });
  });

  describe('GET /api/inventario', () => {
    test('doctor lee existencias: solo ítems activos', async () => {
      const listar = repo('listar').mockResolvedValue([[item()], 1]);

      const res = await request(app)
        .get('/api/inventario?buscar=para&categoria=medicamento&bajo_minimo=true')
        .set(await sesionComo('doctor'));

      expect(res.status).toBe(200);
      expect(ItemInventarioSchema.safeParse(res.body.data.items[0]).success).toBe(true);
      expect(res.body.data.items[0]).toMatchObject({ bajo_minimo: true, tipo_control: 'lote' });
      expect(listar).toHaveBeenCalledWith(
        { buscar: 'para', categoria: 'medicamento', bajo_minimo: true, activo: true },
        0,
        20,
      );
    });

    test('recepción no puede pedir los desactivados → 403', async () => {
      const res = await request(app)
        .get('/api/inventario?activo=false')
        .set(await sesionComo('recepcionista'));
      expect(res.status).toBe(403);
    });

    test('el administrador sí ve los desactivados', async () => {
      const listar = repo('listar').mockResolvedValue([[item({ activo: false })], 1]);

      const res = await request(app)
        .get('/api/inventario?activo=false')
        .set(await sesionComo('administrador'));

      expect(res.status).toBe(200);
      expect(listar.mock.calls[0][0].activo).toBe(false);
    });

    test('400 con una categoría que no existe', async () => {
      const res = await request(app)
        .get('/api/inventario?categoria=comida')
        .set(await sesionComo('administrador'));
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/inventario/:id', () => {
    test('equipo → tipo_control numero_serie', async () => {
      repo('findById').mockResolvedValue(item({ categoria: 'equipo' }));
      const res = await request(app)
        .get(`/api/inventario/${ITEM_ID}`)
        .set(await sesionComo('recepcionista'));
      expect(res.status).toBe(200);
      expect(res.body.data.tipo_control).toBe('numero_serie');
    });

    test('un ítem desactivado es 404 para el doctor', async () => {
      repo('findById').mockResolvedValue(item({ activo: false }));
      const res = await request(app)
        .get(`/api/inventario/${ITEM_ID}`)
        .set(await sesionComo('doctor'));
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/inventario', () => {
    const body = {
      codigo: 'MED-0003',
      nombre: 'Ibuprofeno 400 mg',
      categoria: 'medicamento',
      unidad_medida: 'tableta',
    };

    test('201: nace con stock 0 y stock_minimo por defecto 0', async () => {
      const crear = repo('crear').mockResolvedValue(item({ ...body, stock_actual: 0, stock_minimo: 0 } as Item));

      const res = await request(app)
        .post('/api/inventario')
        .set(await sesionComo('administrador'))
        .send(body);

      expect(res.status).toBe(201);
      expect(crear).toHaveBeenCalledWith({ ...body, stock_minimo: 0 });
    });

    test('stock_actual en el body → 400 con el campo', async () => {
      const crear = repo('crear');

      const res = await request(app)
        .post('/api/inventario')
        .set(await sesionComo('administrador'))
        .send({ ...body, stock_actual: 500 });

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual([{ field: 'stock_actual', message: 'Campo no permitido' }]);
      expect(crear).not.toHaveBeenCalled();
    });

    test('código duplicado → 409', async () => {
      repo('crear').mockRejectedValue(Object.assign(new Error('Unique'), { code: 'P2002' }));
      const res = await request(app)
        .post('/api/inventario')
        .set(await sesionComo('administrador'))
        .send(body);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('REGISTRO_DUPLICADO');
    });
  });

  describe('PATCH y DELETE /api/inventario/:id', () => {
    test('PATCH actualiza solo lo enviado', async () => {
      repo('findById').mockResolvedValue(item());
      const actualizar = repo('actualizar').mockResolvedValue(item({ stock_minimo: 50 }));

      const res = await request(app)
        .patch(`/api/inventario/${ITEM_ID}`)
        .set(await sesionComo('administrador'))
        .send({ stock_minimo: 50 });

      expect(res.status).toBe(200);
      expect(actualizar).toHaveBeenCalledWith(ITEM_ID, { stock_minimo: 50 });
    });

    test('PATCH con stock_actual → 400', async () => {
      const res = await request(app)
        .patch(`/api/inventario/${ITEM_ID}`)
        .set(await sesionComo('administrador'))
        .send({ stock_actual: 1 });
      expect(res.status).toBe(400);
      expect(res.body.errors[0].field).toBe('stock_actual');
    });

    test('cambiar la categoría de un ítem con lotes → 422 TIPO_CONTROL_INVALIDO', async () => {
      repo('findById').mockResolvedValue(item());
      repo('actualizar').mockRejectedValue(errorBd('TIPO_CONTROL_INVALIDO'));
      const res = await request(app)
        .patch(`/api/inventario/${ITEM_ID}`)
        .set(await sesionComo('administrador'))
        .send({ categoria: 'equipo' });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('TIPO_CONTROL_INVALIDO');
    });

    test('DELETE desactiva', async () => {
      repo('findById').mockResolvedValue(item({ stock_actual: 0 }));
      const actualizar = repo('actualizar').mockResolvedValue(item({ stock_actual: 0, activo: false }));

      const res = await request(app)
        .delete(`/api/inventario/${ITEM_ID}`)
        .set(await sesionComo('administrador'));

      expect(res.status).toBe(200);
      expect(res.body.data.activo).toBe(false);
      expect(actualizar).toHaveBeenCalledWith(ITEM_ID, { activo: false });
    });

    test('DELETE con existencias → 422 ITEM_CON_EXISTENCIAS', async () => {
      repo('findById').mockResolvedValue(item());
      repo('actualizar').mockRejectedValue(errorBd('ITEM_CON_EXISTENCIAS'));
      const res = await request(app)
        .delete(`/api/inventario/${ITEM_ID}`)
        .set(await sesionComo('administrador'));
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('ITEM_CON_EXISTENCIAS');
    });

    test('404 si no existe', async () => {
      repo('findById').mockResolvedValue(null);
      const res = await request(app)
        .delete(`/api/inventario/${ITEM_ID}`)
        .set(await sesionComo('administrador'));
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/inventario/:id/lotes', () => {
    test('recepción ve los lotes FEFO con días y alertas', async () => {
      repo('findById').mockResolvedValue(item());
      const listar = repo('listarLotes').mockResolvedValue([
        lote(-2, { numero_lote: 'VEN-1' }),
        lote(10),
        lote(25, { numero_lote: 'AMX-1' }),
        lote(400, { numero_lote: 'PCT-2402' }),
      ]);

      const res = await request(app)
        .get(`/api/inventario/${ITEM_ID}/lotes`)
        .set(await sesionComo('recepcionista'));

      expect(res.status).toBe(200);
      expect(listar).toHaveBeenCalledWith(ITEM_ID, true);
      expect(LoteSchema.safeParse(res.body.data[0]).success).toBe(true);
      expect(res.body.data.map((l: { alerta: string | null }) => l.alerta)).toEqual([
        'vencido',
        '15_dias',
        '30_dias',
        null,
      ]);
      expect(res.body.data[0]).toMatchObject({ vencido: true, dias_restantes: -2 });
    });

    test('con_existencias=false incluye los agotados', async () => {
      repo('findById').mockResolvedValue(item());
      const listar = repo('listarLotes').mockResolvedValue([]);
      await request(app)
        .get(`/api/inventario/${ITEM_ID}/lotes?con_existencias=false`)
        .set(await sesionComo('doctor'));
      expect(listar).toHaveBeenCalledWith(ITEM_ID, false);
    });

    test('un equipo no tiene lotes → 422 TIPO_CONTROL_INVALIDO', async () => {
      repo('findById').mockResolvedValue(item({ categoria: 'equipo' }));
      const res = await request(app)
        .get(`/api/inventario/${ITEM_ID}/lotes`)
        .set(await sesionComo('administrador'));
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('TIPO_CONTROL_INVALIDO');
    });

    test('paciente → 403', async () => {
      const res = await request(app)
        .get(`/api/inventario/${ITEM_ID}/lotes`)
        .set(await sesionComo('paciente'));
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/inventario/:id/entradas', () => {
    const body = { numero_lote: 'pct-2501', fecha_caducidad: '2027-06-30', cantidad: 200, proveedor_id: PROV_ID };

    test('201: usa registrar_entrada_lote a nombre de la sesión', async () => {
      repo('findById').mockResolvedValue(item());
      const entrada = repo('registrarEntrada').mockResolvedValue(
        movimiento({ tipo: 'entrada', cantidad: 200, proveedores: { id: PROV_ID, nombre: 'Distribuidora' } }),
      );

      const res = await request(app)
        .post(`/api/inventario/${ITEM_ID}/entradas`)
        .set(await sesionComo('administrador'))
        .send(body);

      expect(res.status).toBe(201);
      expect(MovimientoSchema.safeParse(res.body.data).success).toBe(true);
      expect(entrada).toHaveBeenCalledWith(
        ITEM_ID,
        { ...body, fecha_caducidad: new Date('2027-06-30T00:00:00Z'), motivo: null },
        USUARIOS.administrador,
      );
      expect(res.body.data.registrado_por.id).toBe(USUARIOS.administrador);
    });

    test.each([
      ['LOTE_VENCIDO', 422],
      ['LOTE_CADUCIDAD_DISTINTA', 409],
      ['PROVEEDOR_INVALIDO', 422],
      ['TIPO_CONTROL_INVALIDO', 422],
      ['ITEM_INACTIVO', 422],
    ])('error de la BD %s → %i con su code', async (code, status) => {
      repo('findById').mockResolvedValue(item());
      repo('registrarEntrada').mockRejectedValue(errorBd(code));

      const res = await request(app)
        .post(`/api/inventario/${ITEM_ID}/entradas`)
        .set(await sesionComo('administrador'))
        .send(body);

      expect(res.status).toBe(status);
      expect(res.body.code).toBe(code);
    });

    test('400 con cantidad 0, sin proveedor o con stock_actual', async () => {
      const headers = await sesionComo('administrador');
      for (const malo of [
        { ...body, cantidad: 0 },
        { ...body, proveedor_id: undefined },
        { ...body, stock_actual: 10 },
      ]) {
        const res = await request(app).post(`/api/inventario/${ITEM_ID}/entradas`).set(headers).send(malo);
        expect(res.status).toBe(400);
      }
    });
  });

  describe('POST /api/inventario/:id/salidas y /ajustes', () => {
    test('salida 201 a nombre de la sesión', async () => {
      repo('findById').mockResolvedValue(item());
      const registrar = repo('registrarMovimiento').mockResolvedValue(movimiento());

      const res = await request(app)
        .post(`/api/inventario/${ITEM_ID}/salidas`)
        .set(await sesionComo('administrador'))
        .send({ lote_id: LOTE_ID, cantidad: 20, motivo: 'Entrega a Emergencia' });

      expect(res.status).toBe(201);
      expect(registrar).toHaveBeenCalledWith(
        ITEM_ID,
        { lote_id: LOTE_ID, cantidad: 20, motivo: 'Entrega a Emergencia', tipo: 'salida' },
        USUARIOS.administrador,
      );
      expect(res.body.data).toMatchObject({ tipo: 'salida', proveedor: null, lote: { cantidad_actual: 100 } });
    });

    test.each([
      ['STOCK_INSUFICIENTE', 409],
      ['LOTE_VENCIDO', 422],
      ['REFERENCIA_INVALIDA', 400],
    ])('salida: %s → %i', async (code, status) => {
      repo('findById').mockResolvedValue(item());
      repo('registrarMovimiento').mockRejectedValue(errorBd(code));
      const res = await request(app)
        .post(`/api/inventario/${ITEM_ID}/salidas`)
        .set(await sesionComo('administrador'))
        .send({ lote_id: LOTE_ID, cantidad: 5, motivo: 'x' });
      expect(res.status).toBe(status);
      expect(res.body.code).toBe(code);
    });

    test('salida sin motivo o con cantidad negativa → 400', async () => {
      const headers = await sesionComo('administrador');
      for (const malo of [
        { lote_id: LOTE_ID, cantidad: 5 },
        { lote_id: LOTE_ID, cantidad: -5, motivo: 'x' },
      ]) {
        const res = await request(app).post(`/api/inventario/${ITEM_ID}/salidas`).set(headers).send(malo);
        expect(res.status).toBe(400);
      }
    });

    test('ajuste negativo 201', async () => {
      repo('findById').mockResolvedValue(item());
      const registrar = repo('registrarMovimiento').mockResolvedValue(movimiento({ tipo: 'ajuste', cantidad: -5 }));

      const res = await request(app)
        .post(`/api/inventario/${ITEM_ID}/ajustes`)
        .set(await sesionComo('administrador'))
        .send({ lote_id: LOTE_ID, cantidad: -5, motivo: 'Descarte por caducidad' });

      expect(res.status).toBe(201);
      expect(registrar.mock.calls[0][1]).toMatchObject({ tipo: 'ajuste', cantidad: -5 });
    });

    test('ajuste de 0 → 400', async () => {
      const res = await request(app)
        .post(`/api/inventario/${ITEM_ID}/ajustes`)
        .set(await sesionComo('administrador'))
        .send({ lote_id: LOTE_ID, cantidad: 0, motivo: 'x' });
      expect(res.status).toBe(400);
    });

    test('ítem inexistente → 404', async () => {
      repo('findById').mockResolvedValue(null);
      const res = await request(app)
        .post(`/api/inventario/${ITEM_ID}/ajustes`)
        .set(await sesionComo('administrador'))
        .send({ lote_id: LOTE_ID, cantidad: 1, motivo: 'x' });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/inventario/movimientos', () => {
    test('filtros y rango de fechas en hora local', async () => {
      const listar = repo('listarMovimientos').mockResolvedValue([[movimiento()], 1]);

      const res = await request(app)
        .get(`/api/inventario/movimientos?item_id=${ITEM_ID}&tipo=salida&desde=2026-11-01&hasta=2026-11-12`)
        .set(await sesionComo('administrador'));

      expect(res.status).toBe(200);
      expect(listar).toHaveBeenCalledWith(
        {
          item_id: ITEM_ID,
          tipo: 'salida',
          desde: new Date('2026-11-01T06:00:00Z'),
          hastaExclusivo: new Date('2026-11-13T06:00:00Z'),
        },
        0,
        20,
      );
    });

    test('desde posterior a hasta → 400', async () => {
      const res = await request(app)
        .get('/api/inventario/movimientos?desde=2026-11-12&hasta=2026-11-01')
        .set(await sesionComo('administrador'));
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/inventario/lotes-por-vencer', () => {
    const fila = (alerta: FilaLotePorVencer['alerta'], dias: number): FilaLotePorVencer => ({
      lote_id: LOTE_ID,
      item_id: ITEM_ID,
      item_codigo: 'MED-0001',
      item_nombre: 'Paracetamol 500 mg',
      categoria: 'medicamento',
      numero_lote: 'PCT-2401',
      fecha_caducidad: fechaDb(dias),
      cantidad_actual: 120,
      dias_restantes: dias,
      alerta,
    });

    test('resumen de todas las alertas y lista filtrada', async () => {
      repo('lotesPorVencer').mockResolvedValue([fila('vencido', -1), fila('15_dias', 10), fila('30_dias', 25)]);

      const res = await request(app)
        .get('/api/inventario/lotes-por-vencer?alerta=15_dias')
        .set(await sesionComo('administrador'));

      expect(res.status).toBe(200);
      expect(LotesPorVencerSchema.safeParse(res.body.data).success).toBe(true);
      expect(res.body.data.resumen).toEqual({ vencidos: 1, en_15_dias: 1, en_30_dias: 1 });
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].item.codigo).toBe('MED-0001');
    });
  });
});
