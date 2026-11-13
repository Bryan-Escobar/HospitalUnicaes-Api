import { Router } from 'express';
import { idParamSchema } from '../../domain/validators/common.validator';
import {
  actualizarItemBodySchema,
  ajusteBodySchema,
  crearItemBodySchema,
  entradaBodySchema,
  listarItemsQuerySchema,
  listarLotesQuerySchema,
  listarMovimientosQuerySchema,
  lotesPorVencerQuerySchema,
  salidaBodySchema,
} from '../../domain/validators/inventario.validator';
import { InventarioService } from '../../services/inventario.service';
import { authenticate, requireRole } from '../middlewares/auth.middleware';
import { validateBody, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { InventarioController } from './inventario.controller';

// Existencias (ítems y lotes): administrador, doctor y recepción. Todo lo demás: solo el administrador (Web).
export class InventarioRoutes {
  static get routes(): Router {
    const router = Router();
    const c = new InventarioController(new InventarioService());
    const id = validateParams(idParamSchema);
    const leen = [authenticate, requireRole('administrador', 'doctor', 'recepcionista')];
    const admin = [authenticate, requireRole('administrador')];

    // Rutas fijas antes de /:id
    router.get('/movimientos', ...admin, validateQuery(listarMovimientosQuerySchema), c.movimientos);
    router.get('/lotes-por-vencer', ...admin, validateQuery(lotesPorVencerQuerySchema), c.lotesPorVencer);

    router.get('/', ...leen, validateQuery(listarItemsQuerySchema), c.listar);
    router.post('/', ...admin, validateBody(crearItemBodySchema), c.crear);
    router.get('/:id', ...leen, id, c.obtener);
    router.patch('/:id', ...admin, id, validateBody(actualizarItemBodySchema), c.actualizar);
    router.delete('/:id', ...admin, id, c.desactivar);

    router.get('/:id/lotes', ...leen, id, validateQuery(listarLotesQuerySchema), c.listarLotes);
    router.post('/:id/entradas', ...admin, id, validateBody(entradaBodySchema), c.entrada);
    router.post('/:id/salidas', ...admin, id, validateBody(salidaBodySchema), c.salida);
    router.post('/:id/ajustes', ...admin, id, validateBody(ajusteBodySchema), c.ajuste);

    return router;
  }
}
