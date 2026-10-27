import { Request, Response } from 'express';
import { ApiResponse } from '../../domain/interfaces';
import {
  CrearOrdenBody,
  ListarOrdenesQuery,
  RegistrarResultadoBody,
} from '../../domain/validators/laboratorio.validator';
import { toErrorResponse } from '../../lib/errorHandler';
import { LaboratorioService } from '../../services/laboratorio.service';

type ConId = { id: string };
type ConExamen = { id: string; orden_examen_id: string };

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

  public listarOrdenes = async (req: Request, res: Response) => {
    await this.responder(res, 200, 'Página de órdenes', () =>
      this.laboratorioService.listarOrdenes(req.query as unknown as ListarOrdenesQuery, req.usuario!),
    );
  };

  public obtenerOrden = async (req: Request<ConId>, res: Response) => {
    await this.responder(res, 200, 'Orden de laboratorio', () =>
      this.laboratorioService.obtenerOrden(req.params.id, req.usuario!),
    );
  };

  public iniciarExamen = async (req: Request<ConExamen>, res: Response) => {
    await this.responder(res, 200, 'Examen en proceso', () =>
      this.laboratorioService.iniciarExamen(req.params.id, req.params.orden_examen_id),
    );
  };

  public registrarResultado = async (req: Request<ConExamen, unknown, RegistrarResultadoBody>, res: Response) => {
    await this.responder(res, 200, 'Examen completado', () =>
      this.laboratorioService.registrarResultado(
        req.params.id,
        req.params.orden_examen_id,
        req.body,
        req.file,
        req.usuario!,
      ),
    );
  };

  public urlArchivo = async (req: Request<ConExamen>, res: Response) => {
    await this.responder(res, 200, 'URL firmada del resultado', () =>
      this.laboratorioService.urlArchivo(req.params.id, req.params.orden_examen_id, req.usuario!),
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
