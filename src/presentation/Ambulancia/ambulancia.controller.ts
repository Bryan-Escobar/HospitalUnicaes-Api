import { Request, Response } from 'express';
import { ApiResponse } from '../../domain/interfaces';
import {
  ActualizarSolicitudBody,
  ActualizarSolicitudPublicaBody,
  BitacoraQuery,
  CambiarEstadoAmbulanciaBody,
  CancelarSolicitudBody,
  CerrarSolicitudBody,
  CrearSolicitudBody,
  CrearSolicitudPublicaBody,
  ListarSolicitudesQuery,
} from '../../domain/validators/ambulancia.validator';
import { toErrorResponse } from '../../lib/errorHandler';
import { AmbulanciaService } from '../../services/ambulancia.service';

type ConId = { id: string };
type ConCodigo = { codigo: string };

export class AmbulanciaController {
  constructor(private readonly ambulanciaService: AmbulanciaService) {}

  public estado = async (req: Request, res: Response) => {
    await this.responder(res, 200, 'Ambulancia', () => this.ambulanciaService.estado(req.usuario!));
  };

  public cambiarEstado = async (req: Request<unknown, unknown, CambiarEstadoAmbulanciaBody>, res: Response) => {
    await this.responder(res, 200, 'Ambulancia actualizada', () =>
      this.ambulanciaService.cambiarEstado(req.body, req.usuario!),
    );
  };

  public crear = async (req: Request<unknown, unknown, CrearSolicitudBody>, res: Response) => {
    await this.responder(res, 201, 'Solicitud creada', () => this.ambulanciaService.crear(req.body, req.usuario!));
  };

  public listar = async (req: Request, res: Response) => {
    await this.responder(res, 200, 'Página de solicitudes', () =>
      this.ambulanciaService.listar(req.query as unknown as ListarSolicitudesQuery, req.usuario!),
    );
  };

  public obtener = async (req: Request<ConId>, res: Response) => {
    await this.responder(res, 200, 'Solicitud', () => this.ambulanciaService.obtener(req.params.id, req.usuario!));
  };

  public actualizar = async (req: Request<ConId, unknown, ActualizarSolicitudBody>, res: Response) => {
    await this.responder(res, 200, 'Solicitud actualizada', () =>
      this.ambulanciaService.actualizar(req.params.id, req.body),
    );
  };

  public despachar = async (req: Request<ConId>, res: Response) => {
    await this.responder(res, 200, 'Ambulancia despachada', () =>
      this.ambulanciaService.despachar(req.params.id, req.usuario!),
    );
  };

  public enCurso = async (req: Request<ConId>, res: Response) => {
    await this.responder(res, 200, 'Servicio en curso', () => this.ambulanciaService.marcarEnCurso(req.params.id));
  };

  public cerrar = async (req: Request<ConId, unknown, CerrarSolicitudBody>, res: Response) => {
    await this.responder(res, 200, 'Servicio cerrado', () =>
      this.ambulanciaService.cerrar(req.params.id, req.body, req.usuario!),
    );
  };

  public cancelar = async (req: Request<ConId, unknown, CancelarSolicitudBody>, res: Response) => {
    await this.responder(res, 200, 'Solicitud cancelada', () =>
      this.ambulanciaService.cancelar(req.params.id, req.body, req.usuario!),
    );
  };

  public bitacora = async (req: Request, res: Response) => {
    await this.responder(res, 200, 'Página de la bitácora', () =>
      this.ambulanciaService.bitacora(req.query as unknown as BitacoraQuery),
    );
  };

  public crearPublica = async (req: Request<unknown, unknown, CrearSolicitudPublicaBody>, res: Response) => {
    await this.responder(res, 201, 'Solicitud recibida', () => this.ambulanciaService.crearPublica(req.body));
  };

  public seguimiento = async (req: Request<ConCodigo>, res: Response) => {
    await this.responder(res, 200, 'Seguimiento', () => this.ambulanciaService.seguimiento(req.params.codigo));
  };

  public actualizarPublica = async (
    req: Request<ConCodigo, unknown, ActualizarSolicitudPublicaBody>,
    res: Response,
  ) => {
    await this.responder(res, 200, 'Datos agregados', () =>
      this.ambulanciaService.actualizarPublica(req.params.codigo, req.body),
    );
  };

  public cancelarPublica = async (req: Request<ConCodigo, unknown, CancelarSolicitudBody>, res: Response) => {
    await this.responder(res, 200, 'Solicitud cancelada', () =>
      this.ambulanciaService.cancelarPublica(req.params.codigo, req.body),
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
