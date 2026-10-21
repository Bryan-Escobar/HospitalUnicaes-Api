import { Router } from 'express';
import { HealthController } from './health.controller';
import { HealthService } from '../../services/health.service';
import { validateBody } from '../middlewares/validation.middleware';
import { echoBodySchema } from '../../domain/validators/health.validator';

export class HealthRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new HealthController(new HealthService());

    router.get('/', controller.getStatus);
    router.post('/echo', validateBody(echoBodySchema), controller.echo);

    return router;
  }
}
