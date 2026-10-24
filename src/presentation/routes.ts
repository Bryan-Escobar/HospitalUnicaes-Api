import { Router } from 'express';
import { AuthRoutes } from './Auth/routes';
import { HealthRoutes } from './Health/routes';
import { PersonalRoutes } from './Personal/routes';

export class AppRoutes {
  static get routes(): Router {
    const router = Router();

    // Infraestructura (sin prefijo): healthchecks de Docker/Dokploy y clientes.
    router.use('/health', HealthRoutes.routes);

    // Endpoints de negocio bajo /api
    router.use('/api/auth', AuthRoutes.routes);
    router.use('/api/personal', PersonalRoutes.routes);

    return router;
  }
}
