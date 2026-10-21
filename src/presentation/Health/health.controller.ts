import { Request, Response } from 'express';
import { HealthService } from '../../services/health.service';
import { handleError } from '../../lib/errorHandler';
import { ApiResponse } from '../../domain/interfaces';

export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  public getStatus = async (_req: Request, res: Response) => {
    try {
      const data = this.healthService.getStatus();
      const response: ApiResponse = {
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

  public echo = async (req: Request, res: Response) => {
    try {
      const { message } = req.body;
      const data = this.healthService.echo(message);
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
