import { envs } from './config/envs';
import { logger } from './config/logger';
import { prisma } from './config/prisma';
import { AppRoutes } from './presentation/routes';
import { Server } from './presentation/server';

async function main() {
  const server = new Server({ port: envs.PORT, routes: AppRoutes.routes });
  await server.start();

  // Apagado ordenado: Docker envía SIGTERM al detener el contenedor.
  const shutdown = async (signal: string) => {
    logger.info(`${signal} recibido, cerrando servidor...`);
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
}

main().catch((err) => {
  logger.fatal({ err }, 'No se pudo iniciar el servidor');
  process.exit(1);
});
