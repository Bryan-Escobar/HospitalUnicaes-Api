import { Router } from 'express';
import {
  actualizarActivoBodySchema,
  crearActivoBodySchema,
  listarActivosQuerySchema,
} from '../../domain/validators/activos.validator';
import { idParamSchema } from '../../domain/validators/common.validator';
import { ActivosService } from '../../services/activos.service';
import { authenticate, requireRole } from '../middlewares/auth.middleware';
import { validateBody, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { ActivosController } from './activos.controller';

// Activos (equipos por número de serie): solo el administrador (context.md §3.6).
export class ActivosRoutes {
  static get routes(): Router {
    const router = Router();
    const c = new ActivosController(new ActivosService());
    const id = validateParams(idParamSchema);
    router.use(authenticate, requireRole('administrador'));

    router.get('/', validateQuery(listarActivosQuerySchema), c.listar);
    router.post('/', validateBody(crearActivoBodySchema), c.crear);
    router.get('/:id', id, c.obtener);
    router.patch('/:id', id, validateBody(actualizarActivoBodySchema), c.actualizar);

    return router;
  }
}
