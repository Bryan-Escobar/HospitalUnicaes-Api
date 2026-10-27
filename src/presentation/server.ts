import cors from 'cors';
import express, { Router } from 'express';
import { Server as HttpServer } from 'http';
import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { envs } from '../config/envs';
import { logger } from '../config/logger';
import { buildOpenApiDocument } from '../docs/openapi';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';

interface Options {
  port: number;
  routes: Router;
  publicPath?: string;
}

export class Server {
  public readonly app = express();
  private readonly port: number;
  private httpServer?: HttpServer;

  constructor({ port, routes, publicPath = 'public' }: Options) {
    this.port = port;
    this.configure(routes, publicPath);
  }

  // Monta middlewares y rutas sin abrir el puerto (los tests usan `app` directamente).
  private configure(routes: Router, publicPath: string) {
    const app = this.app;
    app.disable('x-powered-by');
    // En Dokploy la API va detrás de un solo proxy (Traefik, que termina TLS):
    // así req.ip y req.protocol reflejan al cliente real. Si se agrega otro proxy
    // delante (p. ej. Cloudflare), hay que subir este número.
    app.set('trust proxy', 1);

    app.use(
      pinoHttp({
        logger,
        genReqId: (req, res) => {
          const id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
          res.setHeader('X-Request-Id', id);
          return id;
        },
        customLogLevel: (_req, res, err) =>
          err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        autoLogging: { ignore: (req) => req.url === '/health' }, // healthchecks de Docker sin ruido
        // Solo lo necesario: sin headers ni cuerpos (pueden traer tokens o datos de pacientes).
        serializers: {
          req: (req) => ({ id: req.id, method: req.method, url: req.url }),
          res: (res) => ({ statusCode: res.statusCode }),
        },
      }),
    );

    app.use(cors({ origin: envs.CORS_ORIGINS.includes('*') ? true : envs.CORS_ORIGINS }));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    const openApiDocument = buildOpenApiDocument();
    app.get('/docs.json', (_req, res) => res.json(openApiDocument));
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: 'HospitalUnicaes API' }));

    app.use(express.static(publicPath));
    app.use(routes);

    app.use(notFoundHandler);
    app.use(errorHandler);
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer = this.app.listen(this.port, () => {
        logger.info(`Servidor escuchando en http://localhost:${this.port} (docs en /docs)`);
        resolve();
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.httpServer) return resolve();
      this.httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  }
}
