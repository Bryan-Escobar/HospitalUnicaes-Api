import { Request, Response } from 'express';
import { ApiResponse } from '../../domain/interfaces';
import {
  AltaBody,
  CambiarEstadoCamaBody,
  CrearHospitalizacionBody,
  ListarCamasQuery,
  ListarHabitacionesQuery,
  ListarHospitalizacionesQuery,
  SugerenciaCamaQuery,
  TrasladoBody,
} from '../../domain/validators/habitaciones.validator';
import { toErrorResponse } from '../../lib/errorHandler';
import { HabitacionesService } from '../../services/habitaciones.service';

type ConId = { id: string };

export class HabitacionesController {
  constructor(private readonly habitacionesService: HabitacionesService) {}

  public mapa = async (req: Request, res: Response) => {
    await this.responder(res, 200, 'Mapa de habitaciones', () =>
      this.habitacionesService.mapa(req.query as unknown as ListarHabitacionesQuery, req.usuario!),
    );
  };

  public listarCamas = async (req: Request, res: Response) => {
    await this.responder(res, 200, 'Camas', () =>
      this.habitacionesService.listarCamas(req.query as unknown as ListarCamasQuery),
    );
  };

  public sugerir = async (req: Request, res: Response) => {
    await this.responder(res, 200, 'Cama sugerida', () =>
      this.habitacionesService.sugerir(req.query as unknown as SugerenciaCamaQuery),
    );
  };

  public cambiarEstadoCama = async (req: Request<ConId, unknown, CambiarEstadoCamaBody>, res: Response) => {
    await this.responder(res, 200, 'Cama actualizada', () =>
      this.habitacionesService.cambiarEstadoCama(req.params.id, req.body),
    );
  };

  public ingresar = async (req: Request<unknown, unknown, CrearHospitalizacionBody>, res: Response) => {
    await this.responder(res, 201, 'Paciente ingresado', () =>
      this.habitacionesService.ingresar(req.body, req.usuario!),
    );
  };

  public listar = async (req: Request, res: Response) => {
    await this.responder(res, 200, 'Página de hospitalizaciones', () =>
      this.habitacionesService.listar(req.query as unknown as ListarHospitalizacionesQuery, req.usuario!),
    );
  };

  public obtener = async (req: Request<ConId>, res: Response) => {
    await this.responder(res, 200, 'Hospitalización', () =>
      this.habitacionesService.obtener(req.params.id, req.usuario!),
    );
  };

  public darAlta = async (req: Request<ConId, unknown, AltaBody>, res: Response) => {
    await this.responder(res, 200, 'Alta registrada', () =>
      this.habitacionesService.darAlta(req.params.id, req.body, req.usuario!),
    );
  };

  public trasladar = async (req: Request<ConId, unknown, TrasladoBody>, res: Response) => {
    await this.responder(res, 200, 'Traslado realizado', () =>
      this.habitacionesService.trasladar(req.params.id, req.body, req.usuario!),
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
