import { Router } from 'express';
import { DashboardService } from '../../services/dashboard.service';
import { authenticate, requireRole } from '../middlewares/auth.middleware';
import { DashboardController } from './dashboard.controller';

export class DashboardRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new DashboardController(new DashboardService());

    router.get('/resumen', authenticate, requireRole('administrador'), controller.resumen);

    return router;
  }
}
