import type { WorkerPrismaClient } from '../../database/prismaClient';
import type { ServiceHeartbeatRepository } from '../interfaces/serviceHeartbeatRepository.interface';

const SERVICE_NAME = 'backtest-worker';

export class PrismaServiceHeartbeatRepository implements ServiceHeartbeatRepository {
  public constructor(private readonly prisma: WorkerPrismaClient) {}

  public async recordStarted(workerId: string): Promise<void> {
    const now = new Date();
    await this.prisma.serviceHeartbeat.upsert({
      where: {
        service_instanceId: {
          service: SERVICE_NAME,
          instanceId: workerId,
        },
      },
      create: {
        service: SERVICE_NAME,
        instanceId: workerId,
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

  public async recordHeartbeat(workerId: string): Promise<void> {
    await this.prisma.serviceHeartbeat.update({
      where: {
        service_instanceId: {
          service: SERVICE_NAME,
          instanceId: workerId,
        },
      },
      data: { lastSeenAt: new Date() },
    });
  }

  public async recordStopped(workerId: string): Promise<void> {
    const now = new Date();
    await this.prisma.serviceHeartbeat.update({
      where: {
        service_instanceId: {
          service: SERVICE_NAME,
          instanceId: workerId,
        },
      },
      data: { lastSeenAt: now, stoppedAt: now },
    });
  }
}
