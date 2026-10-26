import { Router } from 'express';
import { AuthRoutes } from './Auth/routes';
import { ConsultasRoutes } from './Consultas/routes';
import { DashboardRoutes } from './Dashboard/routes';
import { CamasRoutes, HabitacionesRoutes, HospitalizacionesRoutes } from './Habitaciones/routes';
import { HealthRoutes } from './Health/routes';
import { LaboratorioRoutes } from './Laboratorio/routes';
import { PacientesRoutes } from './Pacientes/routes';
import { EspecialidadesRoutes, PersonalRoutes } from './Personal/routes';

export class AppRoutes {
  static get routes(): Router {
    const router = Router();

    // Infraestructura (sin prefijo): healthchecks de Docker/Dokploy y clientes.
    router.use('/health', HealthRoutes.routes);

    // Endpoints de negocio bajo /api
    router.use('/api/auth', AuthRoutes.routes);
    router.use('/api/pacientes', PacientesRoutes.routes);
    router.use('/api/personal', PersonalRoutes.routes);
    router.use('/api/especialidades', EspecialidadesRoutes.routes);
    router.use('/api/dashboard', DashboardRoutes.routes);
    router.use('/api/consultas', ConsultasRoutes.routes);
    router.use('/api/laboratorio', LaboratorioRoutes.routes);
    router.use('/api/habitaciones', HabitacionesRoutes.routes);
    router.use('/api/camas', CamasRoutes.routes);
    router.use('/api/hospitalizaciones', HospitalizacionesRoutes.routes);

    return router;
  }
}
