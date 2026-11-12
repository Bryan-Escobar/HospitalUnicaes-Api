import { Request, Response } from 'express';
import { ApiResponse } from '../../domain/interfaces';
import {
  ActualizarItemBody,
  AjusteBody,
  CrearItemBody,
  EntradaBody,
  ListarItemsQuery,
  ListarLotesQuery,
  ListarMovimientosQuery,
  LotesPorVencerQuery,
  SalidaBody,
} from '../../domain/validators/inventario.validator';
import { toErrorResponse } from '../../lib/errorHandler';
import { InventarioService } from '../../services/inventario.service';

type ConId = { id: string };

export class InventarioController {
  constructor(private readonly inventarioService: InventarioService) {}

  public listar = async (req: Request, res: Response) => {
    await this.responder(res, 200, 'Página de inventario', () =>
      this.inventarioService.listar(req.query as unknown as ListarItemsQuery, req.usuario!),
    );
  };

  public obtener = async (req: Request<ConId>, res: Response) => {
    await this.responder(res, 200, 'Ítem de inventario', () =>
      this.inventarioService.obtener(req.params.id, req.usuario!),
    );
  };

  public crear = async (req: Request<unknown, unknown, CrearItemBody>, res: Response) => {
    await this.responder(res, 201, 'Ítem creado', () => this.inventarioService.crear(req.body));
  };

  public actualizar = async (req: Request<ConId, unknown, ActualizarItemBody>, res: Response) => {
    await this.responder(res, 200, 'Ítem actualizado', () =>
      this.inventarioService.actualizar(req.params.id, req.body),
    );
  };

  public desactivar = async (req: Request<ConId>, res: Response) => {
    await this.responder(res, 200, 'Ítem desactivado', () => this.inventarioService.desactivar(req.params.id));
  };

  public listarLotes = async (req: Request<ConId>, res: Response) => {
    await this.responder(res, 200, 'Lotes del ítem (FEFO)', () =>
      this.inventarioService.listarLotes(req.params.id, req.query as unknown as ListarLotesQuery, req.usuario!),
    );
  };

  public entrada = async (req: Request<ConId, unknown, EntradaBody>, res: Response) => {
    await this.responder(res, 201, 'Entrada registrada', () =>
      this.inventarioService.registrarEntrada(req.params.id, req.body, req.usuario!),
    );
  };

  public salida = async (req: Request<ConId, unknown, SalidaBody>, res: Response) => {
    await this.responder(res, 201, 'Salida registrada', () =>
      this.inventarioService.registrarSalida(req.params.id, req.body, req.usuario!),
    );
  };

  public ajuste = async (req: Request<ConId, unknown, AjusteBody>, res: Response) => {
    await this.responder(res, 201, 'Ajuste registrado', () =>
      this.inventarioService.registrarAjuste(req.params.id, req.body, req.usuario!),
    );
  };

  public movimientos = async (req: Request, res: Response) => {
    await this.responder(res, 200, 'Página de movimientos', () =>
      this.inventarioService.listarMovimientos(req.query as unknown as ListarMovimientosQuery),
    );
  };

  public lotesPorVencer = async (req: Request, res: Response) => {
    await this.responder(res, 200, 'Lotes por vencer', () =>
      this.inventarioService.lotesPorVencer(req.query as unknown as LotesPorVencerQuery),
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
