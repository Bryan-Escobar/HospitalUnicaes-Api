import { Router } from "express";
import { HealthRoutes } from "./Health/routes";

export class AppRoutes {
  static get routes(): Router {
    const router = Router();

    router.use("/api/health", HealthRoutes.routes);

    return router;
  }
}
