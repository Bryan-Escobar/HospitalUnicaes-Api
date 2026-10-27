import { envs } from './config/envs';
import { logger } from './config/logger';
import { prisma } from './config/prisma';
import { AppRoutes } from './presentation/routes';
import { Server } from './presentation/server';

// Cuánto esperar a las peticiones en curso antes de salir de todos modos. Docker
// envía SIGKILL 10 s después de SIGTERM, así que esto tiene que terminar antes.
const SHUTDOWN_TIMEOUT_MS = 8_000;

async function main() {
  const server = new Server({ port: envs.PORT, routes: AppRoutes.routes });
  registerShutdownHandlers(server);
  await server.start();
}

/**
 * En el contenedor node corre como PID 1 y, sin un handler explícito, ignora
 * SIGTERM: Docker esperaría su periodo de gracia y mataría el proceso con
 * SIGKILL, cortando peticiones en curso y dejando conexiones a Postgres abiertas
 * en cada redeploy de Dokploy.
 */
function registerShutdownHandlers(server: Server) {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    // Un segundo Ctrl+C (o un SIGTERM repetido) no inicia otro cierre.
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} recibido, cerrando servidor...`);

    // unref: este temporizador nunca mantiene vivo el proceso por sí solo.
    const forceExit = setTimeout(() => {
      logger.error('El cierre tardó demasiado, forzando la salida');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      await server.close();
      await prisma.$disconnect();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error al cerrar el servidor');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Ante un fallo inesperado se sale con código distinto de 0 para que Docker
  // reinicie el contenedor en lugar de dejar un proceso en estado desconocido.
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Excepción no capturada');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Promesa rechazada sin manejar');
    process.exit(1);
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'No se pudo iniciar el servidor');
  process.exit(1);
});
