import { Request, Response } from 'express';
import { ApiResponse } from '../../domain/interfaces';
import { CrearOrdenBody } from '../../domain/validators/laboratorio.validator';
import { toErrorResponse } from '../../lib/errorHandler';
import { LaboratorioService } from '../../services/laboratorio.service';

export class LaboratorioController {
  constructor(private readonly laboratorioService: LaboratorioService) {}

  public listarExamenes = async (_req: Request, res: Response) => {
    await this.responder(res, 200, 'Catálogo de exámenes', () => this.laboratorioService.listarExamenes());
  };

  public crearOrden = async (req: Request<unknown, unknown, CrearOrdenBody>, res: Response) => {
    await this.responder(res, 201, 'Orden de laboratorio creada', () =>
      this.laboratorioService.crearOrden(req.body, req.usuario!),
    );
  };

  private async responder<T>(res: Response, statusCode: 200 | 201, message: string, accion: () => Promise<T>) {
    try {
      const data = await accion();
      const response: ApiResponse<T> = { statusCode, success: true, message, data };
      res.status(statusCode).json(response);
    } catch (error) {
      const response = toErrorResponse(error);
      res.status(response.statusCode).json(response);
    }
  }
}
