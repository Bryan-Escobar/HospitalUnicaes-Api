import { Request, Response } from 'express';
import { ApiResponse } from '../../domain/interfaces';
import { toErrorResponse } from '../../lib/errorHandler';
import { DashboardService, ResumenDashboard } from '../../services/dashboard.service';

export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  public resumen = async (_req: Request, res: Response) => {
    try {
      const data = await this.dashboardService.obtenerResumen();
      const response: ApiResponse<ResumenDashboard> = { statusCode: 200, success: true, message: 'Resumen', data };
      res.status(200).json(response);
    } catch (error) {
      const response = toErrorResponse(error);
      res.status(response.statusCode).json(response);
    }
  };
}
