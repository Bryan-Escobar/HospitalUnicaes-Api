import request from 'supertest';
import { HealthRepository } from '../../src/repositories/health.repository';
import { HealthService } from '../../src/services/health.service';
import { app } from '../helpers/app';

describe('Health API', () => {
  describe('GET /health', () => {
    test('deberia retornar 200 con status ok y la BD arriba', async () => {
      jest.spyOn(HealthRepository.prototype, 'pingDatabase').mockResolvedValue();

      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ statusCode: 200, success: true, data: { status: 'ok', database: 'up' } });
      expect(res.headers['x-request-id']).toBeDefined();
    });

    test('deberia retornar 200 con database down si la BD no responde', async () => {
      jest.spyOn(HealthRepository.prototype, 'pingDatabase').mockRejectedValue(new Error('sin conexion'));

      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.data.database).toBe('down');
    });

    test('deberia retornar 500 con formato estandar si el servicio falla', async () => {
      jest.spyOn(HealthService.prototype, 'getStatus').mockRejectedValue(new Error('inesperado'));

      const res = await request(app).get('/health');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        statusCode: 500,
        success: false,
        code: 'ERROR_INTERNO',
        message: 'Error interno del servidor',
      });
    });
  });

  describe('POST /health/echo', () => {
    test('deberia retornar 200 con el mensaje de echo', async () => {
      const res = await request(app).post('/health/echo').send({ message: 'hola' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.echo).toBe('hola');
    });

    test('deberia retornar 400 con errores de validacion si message esta vacio', async () => {
      const res = await request(app).post('/health/echo').send({ message: '' });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ success: false, code: 'VALIDACION' });
      expect(res.body.errors).toEqual([{ field: 'message', message: 'El mensaje no puede estar vacío' }]);
    });

    test('deberia retornar 400 si no se envia body', async () => {
      const res = await request(app).post('/health/echo').send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('deberia retornar 400 si el JSON esta mal formado', async () => {
      const res = await request(app).post('/health/echo').set('Content-Type', 'application/json').send('{"message":');

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        success: false,
        code: 'JSON_INVALIDO',
        message: 'El cuerpo de la petición no es un JSON válido',
      });
    });
  });
});
