import { Router } from 'express';
import { crearOrdenBodySchema } from '../../domain/validators/laboratorio.validator';
import { LaboratorioService } from '../../services/laboratorio.service';
import { authenticate, requireRole } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validation.middleware';
import { LaboratorioController } from './laboratorio.controller';

/**
 * Laboratorio. HUNI-57 implementa el catálogo y la solicitud de exámenes; el resto de rutas
 * (/ordenes/{id}, estados, resultados) son de HUNI-62 y por ahora responden 404.
 */
export class LaboratorioRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new LaboratorioController(new LaboratorioService());

    router.get(
      '/examenes',
      authenticate,
      requireRole('administrador', 'doctor', 'recepcionista'),
      controller.listarExamenes,
    );
    router.post(
      '/ordenes',
      authenticate,
      requireRole('doctor'),
      validateBody(crearOrdenBodySchema),
      controller.crearOrden,
    );

    return router;
  }
}
