import { Request, Response } from 'express';
import { ApiResponse } from '../../domain/interfaces';
import { toErrorResponse } from '../../lib/errorHandler';
import { EstadoPublico, PublicoService } from '../../services/publico.service';

export class PublicoController {
  constructor(private readonly publicoService: PublicoService) {}

  public estado = async (_req: Request, res: Response) => {
    try {
      const data = await this.publicoService.obtenerEstado();
      const response: ApiResponse<EstadoPublico> = { statusCode: 200, success: true, message: 'Estado público', data };
      res.status(200).json(response);
    } catch (error) {
      const response = toErrorResponse(error);
      res.status(response.statusCode).json(response);
    }
  };
}
