import { prisma } from '../config/prisma';

// Los repositorios son la única capa que habla con Prisma.
export class HealthRepository {
  async pingDatabase(): Promise<void> {
    await prisma.$queryRaw`SELECT 1`;
  }
}
