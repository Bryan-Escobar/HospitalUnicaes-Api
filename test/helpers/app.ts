import { Server } from '../../src/presentation/server';
import { AppRoutes } from '../../src/presentation/routes';

const server = new Server({
  port: 3001,
  routes: AppRoutes.routes,
});

// Setup middleware and routes (but chai-http will handle the port)
server.start();

export const app = server.app;
