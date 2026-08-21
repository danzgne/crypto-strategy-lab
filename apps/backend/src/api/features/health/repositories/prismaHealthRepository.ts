import type { AppPrismaClient } from '../../../../database/prismaClient';
import type { HealthRepository } from './interfaces/healthRepository.interface';

export class PrismaHealthRepository implements HealthRepository {
  public constructor(private readonly prisma: AppPrismaClient) {}

  public async checkConnection(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
