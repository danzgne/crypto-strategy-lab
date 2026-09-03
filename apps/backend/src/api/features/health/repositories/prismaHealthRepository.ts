import type { AppPrismaClient } from '@/database/prismaClient';
import type { HealthRepository } from '@/api/features/health/repositories/interfaces/healthRepository.interface';

const SERVICE_NAME = 'backend';

export class PrismaHealthRepository implements HealthRepository {
  public constructor(private readonly prisma: AppPrismaClient) {}

  public async checkConnection(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  public async recordStarted(instanceId: string): Promise<void> {
    const now = new Date();
    await this.prisma.serviceHeartbeat.upsert({
      where: {
        service_instanceId: { service: SERVICE_NAME, instanceId },
      },
      create: {
        service: SERVICE_NAME,
        instanceId,
        startedAt: now,
        lastSeenAt: now,
      },
      update: {
        startedAt: now,
        lastSeenAt: now,
        stoppedAt: null,
      },
    });
  }

  public async recordHeartbeat(instanceId: string): Promise<void> {
    const now = new Date();
    await this.prisma.serviceHeartbeat.update({
      where: {
        service_instanceId: { service: SERVICE_NAME, instanceId },
      },
      data: { lastSeenAt: now },
    });
  }

  public async recordStopped(instanceId: string): Promise<void> {
    const now = new Date();
    await this.prisma.serviceHeartbeat.update({
      where: {
        service_instanceId: { service: SERVICE_NAME, instanceId },
      },
      data: { lastSeenAt: now, stoppedAt: now },
    });
  }
}
