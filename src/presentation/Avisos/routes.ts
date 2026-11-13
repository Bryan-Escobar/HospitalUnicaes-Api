import { Router } from 'express';
import { ROLES } from '../../domain/dtos/enums';
import {
  actualizarAvisoBodySchema,
  crearAvisoBodySchema,
  listarAvisosQuerySchema,
} from '../../domain/validators/avisos.validator';
import { idParamSchema } from '../../domain/validators/common.validator';
import { AvisosService } from '../../services/avisos.service';
import { authenticate, requireRole } from '../middlewares/auth.middleware';
import { validateBody, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { AvisosController } from './avisos.controller';

// Leen todos los roles (el servicio filtra internos, programados y vencidos). Gestiona solo el administrador.
export class AvisosRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new AvisosController(new AvisosService());
    const id = validateParams(idParamSchema);
    const leer = [authenticate, requireRole(...ROLES)];
    const gestionar = [authenticate, requireRole('administrador')];

    router.get('/', ...leer, validateQuery(listarAvisosQuerySchema), controller.listar);
    router.post('/', ...gestionar, validateBody(crearAvisoBodySchema), controller.crear);
    router.get('/:id', ...leer, id, controller.obtener);
    router.patch('/:id', ...gestionar, id, validateBody(actualizarAvisoBodySchema), controller.actualizar);
    router.delete('/:id', ...gestionar, id, controller.eliminar);

    return router;
  }
}
