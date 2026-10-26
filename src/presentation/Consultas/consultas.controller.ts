import { Request, Response } from 'express';
import { ApiResponse } from '../../domain/interfaces';
import {
  ActualizarConsultaBody,
  CrearConsultaBody,
  CrearDiagnosticoBody,
  CrearRecetaBody,
  ListarConsultasQuery,
} from '../../domain/validators/consultas.validator';
import { ActualizarExpedienteBody } from '../../domain/validators/pacientes.validator';
import { toErrorResponse } from '../../lib/errorHandler';
import { ConsultasService } from '../../services/consultas.service';

type ConId = { id: string };

export class ConsultasController {
  constructor(private readonly consultasService: ConsultasService) {}

  public crear = async (req: Request<unknown, unknown, CrearConsultaBody>, res: Response) => {
    await this.responder(res, 201, 'Consulta registrada', () => this.consultasService.crear(req.body, req.usuario!));
  };

  public listar = async (req: Request, res: Response) => {
    await this.responder(res, 200, 'Página de consultas', () =>
      this.consultasService.listar(req.query as unknown as ListarConsultasQuery, req.usuario!),
    );
  };

  public obtener = async (req: Request<ConId>, res: Response) => {
    await this.responder(res, 200, 'Consulta', () => this.consultasService.obtener(req.params.id, req.usuario!));
  };

  public actualizar = async (req: Request<ConId, unknown, ActualizarConsultaBody>, res: Response) => {
    await this.responder(res, 200, 'Consulta actualizada', () =>
      this.consultasService.actualizar(req.params.id, req.body, req.usuario!),
    );
  };

  public cerrar = async (req: Request<ConId>, res: Response) => {
    await this.responder(res, 200, 'Consulta cerrada', () => this.consultasService.cerrar(req.params.id, req.usuario!));
  };

  public agregarDiagnostico = async (req: Request<ConId, unknown, CrearDiagnosticoBody>, res: Response) => {
    await this.responder(res, 201, 'Diagnóstico agregado', () =>
      this.consultasService.agregarDiagnostico(req.params.id, req.body, req.usuario!),
    );
  };

  public emitirReceta = async (req: Request<ConId, unknown, CrearRecetaBody>, res: Response) => {
    await this.responder(res, 201, 'Receta emitida', () =>
      this.consultasService.emitirReceta(req.params.id, req.body, req.usuario!),
    );
  };

  public historial = async (req: Request<ConId>, res: Response) => {
    await this.responder(res, 200, 'Historial clínico', () =>
      this.consultasService.historial(req.params.id, req.usuario!),
    );
  };

  public actualizarExpediente = async (req: Request<ConId, unknown, ActualizarExpedienteBody>, res: Response) => {
    await this.responder(res, 200, 'Expediente actualizado', () =>
      this.consultasService.actualizarExpediente(req.params.id, req.body, req.usuario!),
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
