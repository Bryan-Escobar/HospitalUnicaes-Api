import { Router } from 'express';
import { reportesQuerySchema } from '../../domain/dtos/reportes.dto';
import { DashboardService } from '../../services/dashboard.service';
import { authenticate, requireRole } from '../middlewares/auth.middleware';
import { validateQuery } from '../middlewares/validation.middleware';
import { DashboardController } from './dashboard.controller';

export class DashboardRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new DashboardController(new DashboardService());

    router.get('/resumen', authenticate, requireRole('administrador'), controller.resumen);
    router.get(
      '/reportes',
      authenticate,
      requireRole('administrador'),
      validateQuery(reportesQuerySchema),
      controller.reportes,
    );

    return router;
  }
}
