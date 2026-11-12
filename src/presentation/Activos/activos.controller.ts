import { Request, Response } from 'express';
import { ApiResponse } from '../../domain/interfaces';
import { ActualizarActivoBody, CrearActivoBody, ListarActivosQuery } from '../../domain/validators/activos.validator';
import { toErrorResponse } from '../../lib/errorHandler';
import { ActivosService } from '../../services/activos.service';

type ConId = { id: string };

export class ActivosController {
  constructor(private readonly activosService: ActivosService) {}

  public listar = async (req: Request, res: Response) => {
    await this.responder(res, 200, 'Página de activos', () =>
      this.activosService.listar(req.query as unknown as ListarActivosQuery),
    );
  };

  public obtener = async (req: Request<ConId>, res: Response) => {
    await this.responder(res, 200, 'Activo', () => this.activosService.obtener(req.params.id));
  };

  public crear = async (req: Request<unknown, unknown, CrearActivoBody>, res: Response) => {
    await this.responder(res, 201, 'Activo registrado', () => this.activosService.crear(req.body, req.usuario!));
  };

  public actualizar = async (req: Request<ConId, unknown, ActualizarActivoBody>, res: Response) => {
    await this.responder(res, 200, 'Activo actualizado', () => this.activosService.actualizar(req.params.id, req.body));
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
