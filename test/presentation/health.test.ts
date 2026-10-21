import { assert } from 'chai';
import sinon from 'sinon';
import request from 'supertest';
import { app } from '../helpers/app';
import { HealthService } from '../../src/services/health.service';

suite('Health API', () => {
  teardown(() => sinon.restore());

  suite('GET /api/health', () => {
    test('deberia retornar 200 con status ok', async () => {
      const mockData = { status: 'ok', timestamp: '2026-01-01T00:00:00.000Z' };
      sinon.stub(HealthService.prototype, 'getStatus').returns(mockData);

      const res = await request(app).get('/api/health');

      assert.equal(res.status, 200, 'deberia ser 200');
      assert.isTrue(res.body.success, 'success deberia ser true');
      assert.equal(res.body.data.status, 'ok');
    });
  });

  suite('POST /api/health/echo', () => {
    test('deberia retornar 200 con el mensaje de echo', async () => {
      sinon.stub(HealthService.prototype, 'echo').returns({ echo: 'hola' });

      const res = await request(app)
        .post('/api/health/echo')
        .send({ message: 'hola' });

      assert.equal(res.status, 200, 'deberia ser 200');
      assert.isTrue(res.body.success);
      assert.equal(res.body.data.echo, 'hola');
    });

    test('deberia retornar 400 si message esta vacio', async () => {
      const res = await request(app)
        .post('/api/health/echo')
        .send({ message: '' });

      assert.equal(res.status, 400, 'deberia ser 400');
      assert.isFalse(res.body.success);
    });

    test('deberia retornar 400 si no se envia body', async () => {
      const res = await request(app).post('/api/health/echo').send({});

      assert.equal(res.status, 400, 'deberia ser 400');
      assert.isFalse(res.body.success);
    });
  });
});
