import { Router } from 'express';
import { idParamSchema } from '../../domain/validators/common.validator';
import {
  cambiarEstadoExamenBodySchema,
  crearOrdenBodySchema,
  listarOrdenesQuerySchema,
  ordenExamenParamsSchema,
  registrarResultadoBodySchema,
} from '../../domain/validators/laboratorio.validator';
import { LaboratorioService } from '../../services/laboratorio.service';
import { authenticate, requireRole } from '../middlewares/auth.middleware';
import { subirPdfOpcional } from '../middlewares/upload.middleware';
import { validateBody, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { LaboratorioController } from './laboratorio.controller';

/**
 * Laboratorio (HUNI-57 y HUNI-62).
 * - Ven órdenes: administración, recepción (procesa los exámenes), el médico tratante y el paciente.
 * - Procesan (iniciar examen y registrar resultado): administración y recepción.
 * - Descargan el PDF: médico tratante, el paciente y administración (recepción no).
 */
export class LaboratorioRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new LaboratorioController(new LaboratorioService());
    const examen = validateParams(ordenExamenParamsSchema);
    const procesan = requireRole('administrador', 'recepcionista');

    router.get(
      '/examenes',
      authenticate,
      requireRole('administrador', 'doctor', 'recepcionista'),
      controller.listarExamenes,
    );
    router.post(
      '/ordenes',
      authenticate,
      requireRole('doctor'),
      validateBody(crearOrdenBodySchema),
      controller.crearOrden,
    );
    router.get(
      '/ordenes',
      authenticate,
      requireRole('administrador', 'doctor', 'recepcionista', 'paciente'),
      validateQuery(listarOrdenesQuerySchema),
      controller.listarOrdenes,
    );
    router.get(
      '/ordenes/:id',
      authenticate,
      requireRole('administrador', 'doctor', 'recepcionista', 'paciente'),
      validateParams(idParamSchema),
      controller.obtenerOrden,
    );
    router.patch(
      '/ordenes/:id/examenes/:orden_examen_id/estado',
      authenticate,
      procesan,
      examen,
      validateBody(cambiarEstadoExamenBodySchema),
      controller.iniciarExamen,
    );
    router.put(
      '/ordenes/:id/examenes/:orden_examen_id/resultado',
      authenticate,
      procesan,
      examen,
      subirPdfOpcional,
      validateBody(registrarResultadoBodySchema),
      controller.registrarResultado,
    );
    router.get(
      '/ordenes/:id/examenes/:orden_examen_id/resultado/archivo',
      authenticate,
      requireRole('administrador', 'doctor', 'paciente'),
      examen,
      controller.urlArchivo,
    );

    return router;
  }
}
