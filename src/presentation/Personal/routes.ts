import { Router } from 'express';
import { crearPersonalBodySchema } from '../../domain/validators/personal.validator';
import { PersonalService } from '../../services/personal.service';
import { authenticate, requireRole } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validation.middleware';
import { PersonalController } from './personal.controller';

// El resto de /api/personal (listar, detalle, editar, desactivar) llega en HUNI-45.
export class PersonalRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new PersonalController(new PersonalService());

    router.post(
      '/',
      authenticate,
      requireRole('administrador'),
      validateBody(crearPersonalBodySchema),
      controller.crear,
    );

    return router;
  }
}
