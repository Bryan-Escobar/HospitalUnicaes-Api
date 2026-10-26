import { Router } from 'express';
import { idParamSchema } from '../../domain/validators/common.validator';
import {
  altaBodySchema,
  cambiarEstadoCamaBodySchema,
  crearHospitalizacionBodySchema,
  listarCamasQuerySchema,
  listarHabitacionesQuerySchema,
  listarHospitalizacionesQuerySchema,
  sugerenciaCamaQuerySchema,
  trasladoBodySchema,
} from '../../domain/validators/habitaciones.validator';
import { HabitacionesService } from '../../services/habitaciones.service';
import { authenticate, requireRole } from '../middlewares/auth.middleware';
import { validateBody, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { HabitacionesController } from './habitaciones.controller';

const gestionan = requireRole('administrador', 'recepcionista');
const crearController = () => new HabitacionesController(new HabitacionesService());

/** /api/habitaciones: mapa con ocupantes (privado). La ocupación pública (solo cantidades) es otro endpoint. */
export class HabitacionesRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = crearController();
    router.get(
      '/',
      authenticate,
      requireRole('administrador', 'recepcionista', 'doctor'),
      validateQuery(listarHabitacionesQuerySchema),
      controller.mapa,
    );
    return router;
  }
}

/** /api/camas: listado, sugerencia y estado (limpieza → disponible, mantenimiento). */
export class CamasRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = crearController();
    router.get('/', authenticate, gestionan, validateQuery(listarCamasQuerySchema), controller.listarCamas);
    router.get('/sugerencia', authenticate, gestionan, validateQuery(sugerenciaCamaQuerySchema), controller.sugerir);
    router.patch(
      '/:id/estado',
      authenticate,
      gestionan,
      validateParams(idParamSchema),
      validateBody(cambiarEstadoCamaBodySchema),
      controller.cambiarEstadoCama,
    );
    return router;
  }
}

/** /api/hospitalizaciones: ingreso (asignar cama), alta y traslado. */
export class HospitalizacionesRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = crearController();
    const id = validateParams(idParamSchema);
    router.post('/', authenticate, gestionan, validateBody(crearHospitalizacionBodySchema), controller.ingresar);
    router.get(
      '/',
      authenticate,
      requireRole('administrador', 'recepcionista', 'doctor', 'paciente'),
      validateQuery(listarHospitalizacionesQuerySchema),
      controller.listar,
    );
    router.get(
      '/:id',
      authenticate,
      requireRole('administrador', 'recepcionista', 'doctor', 'paciente'),
      id,
      controller.obtener,
    );
    router.post('/:id/alta', authenticate, gestionan, id, validateBody(altaBodySchema), controller.darAlta);
    router.post('/:id/traslado', authenticate, gestionan, id, validateBody(trasladoBodySchema), controller.trasladar);
    return router;
  }
}
