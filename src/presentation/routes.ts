import { Router } from 'express';
import { ActivosRoutes } from './Activos/routes';
import { AmbulanciaPublicaRoutes, AmbulanciaRoutes } from './Ambulancia/routes';
import { AuthRoutes } from './Auth/routes';
import { AvisosRoutes } from './Avisos/routes';
import { ConsultasRoutes } from './Consultas/routes';
import { DashboardRoutes } from './Dashboard/routes';
import { CamasRoutes, HabitacionesRoutes, HospitalizacionesRoutes } from './Habitaciones/routes';
import { HealthRoutes } from './Health/routes';
import { InventarioRoutes } from './Inventario/routes';
import { LaboratorioRoutes } from './Laboratorio/routes';
import { PacientesRoutes } from './Pacientes/routes';
import { EspecialidadesRoutes, PersonalRoutes, TiposPersonalRoutes } from './Personal/routes';
import { ProveedoresRoutes } from './Proveedores/routes';
import { PublicoRoutes } from './Publico/routes';

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
    router.use('/api/tipos-personal', TiposPersonalRoutes.routes);
    router.use('/api/dashboard', DashboardRoutes.routes);
    router.use('/api/consultas', ConsultasRoutes.routes);
    router.use('/api/laboratorio', LaboratorioRoutes.routes);
    router.use('/api/habitaciones', HabitacionesRoutes.routes);
    router.use('/api/camas', CamasRoutes.routes);
    router.use('/api/hospitalizaciones', HospitalizacionesRoutes.routes);
    router.use('/api/ambulancia', AmbulanciaRoutes.routes);
    router.use('/api/avisos', AvisosRoutes.routes);
    router.use('/api/inventario', InventarioRoutes.routes);
    router.use('/api/proveedores', ProveedoresRoutes.routes);
    router.use('/api/activos', ActivosRoutes.routes);

    // Sin sesión (context.md §3.4)
    router.use('/api/publico/ambulancia', AmbulanciaPublicaRoutes.routes);
    router.use('/api/publico', PublicoRoutes.routes);

    return router;
  }
}
