import { Router } from 'express';
import { HealthRoutes } from './Health/routes';

export class AppRoutes {
  static get routes(): Router {
    const router = Router();

    // Infraestructura (sin prefijo): healthchecks de Docker/Dokploy y clientes.
    router.use('/health', HealthRoutes.routes);

    // Endpoints de negocio: montar bajo /api, p. ej. router.use('/api/pacientes', PacientesRoutes.routes);

    return router;
  }
}
