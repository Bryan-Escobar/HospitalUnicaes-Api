import request from 'supertest';
import { app } from '../helpers/app';

describe('App', () => {
  test('deberia retornar 404 con formato estandar para rutas inexistentes', async () => {
    const res = await request(app).get('/api/no-existe');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      statusCode: 404,
      success: false,
      code: 'RUTA_NO_ENCONTRADA',
      message: 'Ruta no encontrada: GET /api/no-existe',
    });
  });

  test('deberia servir la especificacion OpenAPI en /docs.json', async () => {
    const res = await request(app).get('/docs.json');

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
    expect(Object.keys(res.body.paths)).toEqual(expect.arrayContaining(['/health', '/health/echo']));
  });

  test('deberia servir Swagger UI en /docs', async () => {
    const res = await request(app).get('/docs/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });
});
