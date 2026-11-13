import { Router } from 'express';
import {
  actualizarSolicitudBodySchema,
  actualizarSolicitudPublicaBodySchema,
  bitacoraQuerySchema,
  cambiarEstadoAmbulanciaBodySchema,
  cancelarSolicitudBodySchema,
  cerrarSolicitudBodySchema,
  codigoSeguimientoParamSchema,
  crearSolicitudBodySchema,
  crearSolicitudPublicaBodySchema,
  listarSolicitudesQuerySchema,
} from '../../domain/validators/ambulancia.validator';
import { idParamSchema } from '../../domain/validators/common.validator';
import { AmbulanciaService } from '../../services/ambulancia.service';
import { authenticate, requireRole } from '../middlewares/auth.middleware';
import { limitarPorIp } from '../middlewares/rate-limit.middleware';
import { validateBody, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { AmbulanciaController } from './ambulancia.controller';

const todos = requireRole('administrador', 'doctor', 'recepcionista', 'paciente');
const recepcion = requireRole('recepcionista');

/** Botón público del login: 3 solicitudes por IP cada 15 minutos. */
export const limiteSolicitudPublica = limitarPorIp({
  maximo: 3,
  ventanaMs: 15 * 60 * 1000,
  mensaje: 'Ya enviaste una solicitud de ambulancia; espera a que recepción la atienda',
});

/** /api/ambulancia: estado, mantenimiento, solicitudes con sesión, despacho y bitácora (HUNI-70). */
export class AmbulanciaRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new AmbulanciaController(new AmbulanciaService());
    const id = validateParams(idParamSchema);

    router.get('/', authenticate, todos, controller.estado);
    router.patch(
      '/estado',
      authenticate,
      requireRole('administrador'),
      validateBody(cambiarEstadoAmbulanciaBodySchema),
      controller.cambiarEstado,
    );
    router.get(
      '/bitacora',
      authenticate,
      requireRole('administrador', 'recepcionista', 'doctor'),
      validateQuery(bitacoraQuerySchema),
      controller.bitacora,
    );

    router.post(
      '/solicitudes',
      authenticate,
      requireRole('paciente', 'recepcionista', 'doctor'),
      validateBody(crearSolicitudBodySchema),
      controller.crear,
    );
    router.get('/solicitudes', authenticate, todos, validateQuery(listarSolicitudesQuerySchema), controller.listar);
    router.get('/solicitudes/:id', authenticate, todos, id, controller.obtener);
    router.patch(
      '/solicitudes/:id',
      authenticate,
      requireRole('recepcionista', 'administrador'),
      id,
      validateBody(actualizarSolicitudBodySchema),
      controller.actualizar,
    );
    router.post('/solicitudes/:id/despachar', authenticate, recepcion, id, controller.despachar);
    router.post('/solicitudes/:id/en-curso', authenticate, recepcion, id, controller.enCurso);
    router.post(
      '/solicitudes/:id/cerrar',
      authenticate,
      recepcion,
      id,
      validateBody(cerrarSolicitudBodySchema),
      controller.cerrar,
    );
    router.post(
      '/solicitudes/:id/cancelar',
      authenticate,
      requireRole('recepcionista', 'administrador', 'paciente'),
      id,
      validateBody(cancelarSolicitudBodySchema),
      controller.cancelar,
    );
    return router;
  }
}

/** /api/publico/ambulancia: botón "Solicitar ambulancia" del login, sin sesión, y su seguimiento por código. */
export class AmbulanciaPublicaRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new AmbulanciaController(new AmbulanciaService());
    const codigo = validateParams(codigoSeguimientoParamSchema);

    router.post(
      '/solicitudes',
      validateBody(crearSolicitudPublicaBodySchema),
      limiteSolicitudPublica,
      controller.crearPublica,
    );
    router.get('/solicitudes/:codigo', codigo, controller.seguimiento);
    router.patch(
      '/solicitudes/:codigo',
      codigo,
      validateBody(actualizarSolicitudPublicaBodySchema),
      controller.actualizarPublica,
    );
    router.post(
      '/solicitudes/:codigo/cancelar',
      codigo,
      validateBody(cancelarSolicitudBodySchema),
      controller.cancelarPublica,
    );
    return router;
  }
}
