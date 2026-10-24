import { Router } from 'express';
import { ROLES } from '../../domain/dtos/enums';
import { actualizarMiPerfilBodySchema, registroPacienteBodySchema } from '../../domain/validators/auth.validator';
import { AuthService } from '../../services/auth.service';
import { authenticate, requireRole } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validation.middleware';
import { AuthController } from './auth.controller';

export class AuthRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new AuthController(new AuthService());

    router.post('/registro', validateBody(registroPacienteBodySchema), controller.registrar);
    router.get('/me', authenticate, requireRole(...ROLES), controller.getMe);
    router.patch(
      '/me',
      authenticate,
      requireRole(...ROLES),
      validateBody(actualizarMiPerfilBodySchema),
      controller.actualizarMe,
    );

    return router;
  }
}
