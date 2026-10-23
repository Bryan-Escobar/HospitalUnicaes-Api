import { Request, Response } from 'express';
import { ApiResponse, HealthStatus } from '../../domain/interfaces';
import { EchoBody } from '../../domain/validators/health.validator';
import { handleError } from '../../lib/errorHandler';
import { HealthService } from '../../services/health.service';

export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  public getStatus = async (_req: Request, res: Response) => {
    try {
      const data = await this.healthService.getStatus();
      const response: ApiResponse<HealthStatus> = {
        statusCode: 200,
        success: true,
        message: 'Servidor operativo',
        data,
      };
      res.status(200).json(response);
    } catch (error) {
      const { statusCode, message } = handleError(error);
      res.status(statusCode).json({ statusCode, success: false, message });
    }
  };

  public echo = async (req: Request<unknown, unknown, EchoBody>, res: Response) => {
    try {
      const data = this.healthService.echo(req.body.message);
      const response: ApiResponse = {
        statusCode: 200,
        success: true,
        message: 'Echo exitoso',
        data,
      };
      res.status(200).json(response);
    } catch (error) {
      const { statusCode, message } = handleError(error);
      res.status(statusCode).json({ statusCode, success: false, message });
    }
  };
}
