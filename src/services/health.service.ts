import { CustomError } from '../domain/errors/CustomError';
import { HealthStatus } from '../domain/interfaces';
import { HealthRepository } from '../repositories/health.repository';

const DB_TIMEOUT_MS = 2000;

export class HealthService {
  constructor(private readonly healthRepository = new HealthRepository()) {}

  // El servidor responde aunque la BD esté caída: el estado de la BD va en el cuerpo.
  async getStatus(): Promise<HealthStatus> {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      database: (await this.isDatabaseUp()) ? 'up' : 'down',
    };
  }

  echo(message: string) {
    if (!message) throw CustomError.badRequest('Mensaje requerido');
    return { echo: message };
  }

  private async isDatabaseUp(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), DB_TIMEOUT_MS);
    });
    try {
      await Promise.race([this.healthRepository.pingDatabase(), timeout]);
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
