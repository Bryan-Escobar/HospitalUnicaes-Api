import { CustomError } from '../domain/errors/CustomError';

export class HealthService {
  getStatus() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  echo(message: string) {
    if (!message) throw CustomError.badRequest('Mensaje requerido');
    return { echo: message };
  }
}
