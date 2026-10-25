import { Router } from 'express';
import { idParamSchema } from '../../domain/validators/common.validator';
import {
  actualizarPacienteBodySchema,
  crearPacienteBodySchema,
  listarPacientesQuerySchema,
} from '../../domain/validators/pacientes.validator';
import { PacientesService } from '../../services/pacientes.service';
import { authenticate, requireRole } from '../middlewares/auth.middleware';
import { validateBody, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { PacientesController } from './pacientes.controller';

export class PacientesRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new PacientesController(new PacientesService());
    const id = validateParams(idParamSchema);

    // authenticate va en cada ruta (no con router.use) para que las rutas pendientes de /api/pacientes/*
    // (p. ej. /{id}/expediente) sigan respondiendo 404 RUTA_NO_ENCONTRADA y no 401.
    router.get(
      '/',
      authenticate,
      requireRole('administrador', 'recepcionista', 'doctor'),
      validateQuery(listarPacientesQuerySchema),
      controller.listar,
    );
    router.post(
      '/',
      authenticate,
      requireRole('administrador', 'recepcionista'),
      validateBody(crearPacienteBodySchema),
      controller.crear,
    );
    router.get(
      '/:id',
      authenticate,
      requireRole('administrador', 'recepcionista', 'doctor', 'paciente'),
      id,
      controller.obtener,
    );
    router.patch(
      '/:id',
      authenticate,
      requireRole('administrador', 'recepcionista', 'paciente'),
      id,
      validateBody(actualizarPacienteBodySchema),
      controller.actualizar,
    );
    router.delete('/:id', authenticate, requireRole('administrador', 'recepcionista'), id, controller.desactivar);

    return router;
  }
}
