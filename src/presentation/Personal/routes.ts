import { Router } from 'express';
import { ROLES } from '../../domain/dtos/enums';
import { idParamSchema } from '../../domain/validators/common.validator';
import {
  actualizarPersonalBodySchema,
  crearPersonalBodySchema,
  listarPersonalQuerySchema,
} from '../../domain/validators/personal.validator';
import { PersonalService } from '../../services/personal.service';
import { authenticate, requireRole } from '../middlewares/auth.middleware';
import { validateBody, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { PersonalController } from './personal.controller';

const controller = () => new PersonalController(new PersonalService());

// Ver personal: administrador y recepción. Gestionarlo (crear, editar, desactivar): solo administrador.
export class PersonalRoutes {
  static get routes(): Router {
    const router = Router();
    const c = controller();
    const id = validateParams(idParamSchema);
    const verPersonal = [authenticate, requireRole('administrador', 'recepcionista')];
    const gestionarPersonal = [authenticate, requireRole('administrador')];

    router.get('/', ...verPersonal, validateQuery(listarPersonalQuerySchema), c.listar);
    router.post('/', ...gestionarPersonal, validateBody(crearPersonalBodySchema), c.crear);
    router.get('/:id', ...verPersonal, id, c.obtener);
    router.patch('/:id', ...gestionarPersonal, id, validateBody(actualizarPersonalBodySchema), c.actualizar);
    router.delete('/:id', ...gestionarPersonal, id, c.desactivar);

    return router;
  }
}

export class EspecialidadesRoutes {
  static get routes(): Router {
    const router = Router();
    router.get('/', authenticate, requireRole(...ROLES), controller().listarEspecialidades);
    return router;
  }
}

// Catálogo de tipos de personal (HUNI-46). Por ahora solo lectura: alta y edición del catálogo siguen pendientes.
export class TiposPersonalRoutes {
  static get routes(): Router {
    const router = Router();
    router.get('/', authenticate, requireRole(...ROLES), controller().listarTiposPersonal);
    return router;
  }
}
