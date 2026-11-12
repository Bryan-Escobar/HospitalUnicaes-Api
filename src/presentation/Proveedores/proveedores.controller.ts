import { Request, Response } from 'express';
import { ApiResponse } from '../../domain/interfaces';
import {
  ActualizarProveedorBody,
  CrearProveedorBody,
  ListarProveedoresQuery,
} from '../../domain/validators/proveedores.validator';
import { toErrorResponse } from '../../lib/errorHandler';
import { ProveedoresService } from '../../services/proveedores.service';

type ConId = { id: string };

export class ProveedoresController {
  constructor(private readonly proveedoresService: ProveedoresService) {}

  public listar = async (req: Request, res: Response) => {
    await this.responder(res, 200, 'Página de proveedores', () =>
      this.proveedoresService.listar(req.query as unknown as ListarProveedoresQuery),
    );
  };

  public obtener = async (req: Request<ConId>, res: Response) => {
    await this.responder(res, 200, 'Proveedor', () => this.proveedoresService.obtener(req.params.id));
  };

  public crear = async (req: Request<unknown, unknown, CrearProveedorBody>, res: Response) => {
    await this.responder(res, 201, 'Proveedor creado', () => this.proveedoresService.crear(req.body));
  };

  public actualizar = async (req: Request<ConId, unknown, ActualizarProveedorBody>, res: Response) => {
    await this.responder(res, 200, 'Proveedor actualizado', () =>
      this.proveedoresService.actualizar(req.params.id, req.body),
    );
  };

  public desactivar = async (req: Request<ConId>, res: Response) => {
    await this.responder(res, 200, 'Proveedor desactivado', () => this.proveedoresService.desactivar(req.params.id));
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
