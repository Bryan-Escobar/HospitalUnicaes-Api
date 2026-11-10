import { Router } from 'express';
import { PublicoService } from '../../services/publico.service';
import { PublicoController } from './publico.controller';

/** /api/publico: información pública sin sesión (context.md §3.4, HUNI-74). */
export class PublicoRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new PublicoController(new PublicoService());

    router.get('/estado', controller.estado);

    return router;
  }
}
