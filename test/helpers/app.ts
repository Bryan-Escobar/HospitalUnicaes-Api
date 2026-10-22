import { AppRoutes } from '../../src/presentation/routes';
import { Server } from '../../src/presentation/server';

// App de Express completa sin abrir puerto: supertest la usa directamente.
export const app = new Server({ port: 0, routes: AppRoutes.routes }).app;
