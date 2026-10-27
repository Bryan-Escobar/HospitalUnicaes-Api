import { Router } from 'express';
import { idParamSchema } from '../../domain/validators/common.validator';
import {
  actualizarExpedienteBodySchema,
  actualizarPacienteBodySchema,
  crearPacienteBodySchema,
  listarPacientesQuerySchema,
} from '../../domain/validators/pacientes.validator';
import { ConsultasService } from '../../services/consultas.service';
import { PacientesService } from '../../services/pacientes.service';
import { ConsultasController } from '../Consultas/consultas.controller';
import { authenticate, requireRole } from '../middlewares/auth.middleware';
import { validateBody, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { PacientesController } from './pacientes.controller';

export class PacientesRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new PacientesController(new PacientesService());
    const clinico = new ConsultasController(new ConsultasService());
    const id = validateParams(idParamSchema);

    // authenticate va en cada ruta (no con router.use) para que una ruta que no existe en /api/pacientes/*
    // siga respondiendo 404 RUTA_NO_ENCONTRADA y no 401.
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

    // Historial clínico y expediente (HUNI-57): información clínica, recepción no entra.
    router.get(
      '/:id/historial',
      authenticate,
      requireRole('administrador', 'doctor', 'paciente'),
      id,
      clinico.historial,
    );
    router.patch(
      '/:id/expediente',
      authenticate,
      requireRole('doctor'),
      id,
      validateBody(actualizarExpedienteBodySchema),
      clinico.actualizarExpediente,
    );

    return router;
  }
}
