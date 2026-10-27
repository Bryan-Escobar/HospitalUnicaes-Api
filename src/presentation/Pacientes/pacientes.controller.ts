import { Request, Response } from 'express';
import { ApiResponse } from '../../domain/interfaces';
import {
  ActualizarPacienteBody,
  CrearPacienteBody,
  ListarPacientesQuery,
} from '../../domain/validators/pacientes.validator';
import { toErrorResponse } from '../../lib/errorHandler';
import { PacientesService } from '../../services/pacientes.service';

type ConId = { id: string };

export class PacientesController {
  constructor(private readonly pacientesService: PacientesService) {}

  public listar = async (req: Request, res: Response) => {
    await this.responder(res, 200, 'Página de pacientes', () =>
      this.pacientesService.listar(req.query as unknown as ListarPacientesQuery, req.usuario!),
    );
  };

  public obtener = async (req: Request<ConId>, res: Response) => {
    await this.responder(res, 200, 'Paciente', () => this.pacientesService.obtener(req.params.id, req.usuario!));
  };

  public crear = async (req: Request<unknown, unknown, CrearPacienteBody>, res: Response) => {
    await this.responder(res, 201, 'Paciente creado', () => this.pacientesService.crear(req.body));
  };

  public actualizar = async (req: Request<ConId, unknown, ActualizarPacienteBody>, res: Response) => {
    await this.responder(res, 200, 'Paciente actualizado', () =>
      this.pacientesService.actualizar(req.params.id, req.body, req.usuario!),
    );
  };

  public desactivar = async (req: Request<ConId>, res: Response) => {
    await this.responder(res, 200, 'Paciente desactivado', () => this.pacientesService.desactivar(req.params.id));
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
