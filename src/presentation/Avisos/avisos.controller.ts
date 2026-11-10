import { Request, Response } from 'express';
import { ApiResponse } from '../../domain/interfaces';
import { ActualizarAvisoBody, CrearAvisoBody, ListarAvisosQuery } from '../../domain/validators/avisos.validator';
import { toErrorResponse } from '../../lib/errorHandler';
import { AvisosService } from '../../services/avisos.service';

type ConId = { id: string };

export class AvisosController {
  constructor(private readonly avisosService: AvisosService) {}

  public listar = async (req: Request, res: Response) => {
    await this.responder(res, 200, 'Página de avisos', () =>
      this.avisosService.listar(req.query as unknown as ListarAvisosQuery, req.usuario!),
    );
  };

  public obtener = async (req: Request<ConId>, res: Response) => {
    await this.responder(res, 200, 'Aviso', () => this.avisosService.obtener(req.params.id, req.usuario!));
  };

  public crear = async (req: Request<unknown, unknown, CrearAvisoBody>, res: Response) => {
    await this.responder(res, 201, 'Aviso publicado', () => this.avisosService.crear(req.body, req.usuario!));
  };

  public actualizar = async (req: Request<ConId, unknown, ActualizarAvisoBody>, res: Response) => {
    await this.responder(res, 200, 'Aviso actualizado', () => this.avisosService.actualizar(req.params.id, req.body));
  };

  public eliminar = async (req: Request<ConId>, res: Response) => {
    await this.responder(res, 200, 'Aviso eliminado', () => this.avisosService.eliminar(req.params.id));
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
