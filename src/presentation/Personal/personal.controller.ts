import { Request, Response } from 'express';
import { ApiResponse } from '../../domain/interfaces';
import {
  ActualizarPersonalBody,
  CrearPersonalBody,
  ListarPersonalQuery,
} from '../../domain/validators/personal.validator';
import { toErrorResponse } from '../../lib/errorHandler';
import { PersonalService } from '../../services/personal.service';

type ConId = { id: string };

export class PersonalController {
  constructor(private readonly personalService: PersonalService) {}

  public listar = async (req: Request, res: Response) => {
    await this.responder(res, 200, 'Página de personal', () =>
      this.personalService.listar(req.query as unknown as ListarPersonalQuery),
    );
  };

  public obtener = async (req: Request<ConId>, res: Response) => {
    await this.responder(res, 200, 'Empleado', () => this.personalService.obtener(req.params.id));
  };

  public crear = async (req: Request<unknown, unknown, CrearPersonalBody>, res: Response) => {
    await this.responder(res, 201, 'Empleado creado', () => this.personalService.crear(req.body));
  };

  public actualizar = async (req: Request<ConId, unknown, ActualizarPersonalBody>, res: Response) => {
    await this.responder(res, 200, 'Empleado actualizado', () =>
      this.personalService.actualizar(req.params.id, req.body, req.usuario!),
    );
  };

  public desactivar = async (req: Request<ConId>, res: Response) => {
    await this.responder(res, 200, 'Empleado desactivado', () =>
      this.personalService.desactivar(req.params.id, req.usuario!),
    );
  };

  public listarEspecialidades = async (_req: Request, res: Response) => {
    await this.responder(res, 200, 'Especialidades', () => this.personalService.listarEspecialidades());
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
