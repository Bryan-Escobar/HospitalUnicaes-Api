import { Router } from 'express';
import { idParamSchema } from '../../domain/validators/common.validator';
import {
  actualizarConsultaBodySchema,
  crearConsultaBodySchema,
  crearDiagnosticoBodySchema,
  crearRecetaBodySchema,
  listarConsultasQuerySchema,
} from '../../domain/validators/consultas.validator';
import { ConsultasService } from '../../services/consultas.service';
import { authenticate, requireRole } from '../middlewares/auth.middleware';
import { validateBody, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { ConsultasController } from './consultas.controller';

/** Información clínica: recepción no entra (context.md §3.4). Escribe solo el doctor. */
const LECTORES = ['administrador', 'doctor', 'paciente'] as const;

export class ConsultasRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new ConsultasController(new ConsultasService());
    const id = validateParams(idParamSchema);

    router.post('/', authenticate, requireRole('doctor'), validateBody(crearConsultaBodySchema), controller.crear);
    router.get(
      '/',
      authenticate,
      requireRole(...LECTORES),
      validateQuery(listarConsultasQuerySchema),
      controller.listar,
    );
    router.get('/:id', authenticate, requireRole(...LECTORES), id, controller.obtener);
    router.patch(
      '/:id',
      authenticate,
      requireRole('doctor'),
      id,
      validateBody(actualizarConsultaBodySchema),
      controller.actualizar,
    );
    router.post(
      '/:id/diagnosticos',
      authenticate,
      requireRole('doctor'),
      id,
      validateBody(crearDiagnosticoBodySchema),
      controller.agregarDiagnostico,
    );
    router.post(
      '/:id/recetas',
      authenticate,
      requireRole('doctor'),
      id,
      validateBody(crearRecetaBodySchema),
      controller.emitirReceta,
    );
    router.post('/:id/cerrar', authenticate, requireRole('doctor'), id, controller.cerrar);

    return router;
  }
}
