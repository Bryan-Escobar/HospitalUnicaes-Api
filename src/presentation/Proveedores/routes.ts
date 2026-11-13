import { Router } from 'express';
import { idParamSchema } from '../../domain/validators/common.validator';
import {
  actualizarProveedorBodySchema,
  crearProveedorBodySchema,
  listarProveedoresQuerySchema,
} from '../../domain/validators/proveedores.validator';
import { ProveedoresService } from '../../services/proveedores.service';
import { authenticate, requireRole } from '../middlewares/auth.middleware';
import { validateBody, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { ProveedoresController } from './proveedores.controller';

// Proveedores: solo el administrador (context.md §3.6).
export class ProveedoresRoutes {
  static get routes(): Router {
    const router = Router();
    const c = new ProveedoresController(new ProveedoresService());
    const id = validateParams(idParamSchema);
    router.use(authenticate, requireRole('administrador'));

    router.get('/', validateQuery(listarProveedoresQuerySchema), c.listar);
    router.post('/', validateBody(crearProveedorBodySchema), c.crear);
    router.get('/:id', id, c.obtener);
    router.patch('/:id', id, validateBody(actualizarProveedorBodySchema), c.actualizar);
    router.delete('/:id', id, c.desactivar);

    return router;
  }
}
