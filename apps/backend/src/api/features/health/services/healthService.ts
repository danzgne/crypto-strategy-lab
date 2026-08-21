import { ServiceUnavailableError } from '../../../../errors/AppError';
import type { HealthRepository } from '../repositories/interfaces/healthRepository.interface';
import type {
  HealthService as HealthServiceContract,
  LivenessStatus,
  ReadinessStatus,
} from './interfaces/healthService.interface';

export class HealthService implements HealthServiceContract {
  public constructor(private readonly repository: HealthRepository) {}

  public getLiveness(): LivenessStatus {
    return { service: 'backend', status: 'ok' };
  }

  public async getReadiness(): Promise<ReadinessStatus> {
    try {
      await this.repository.checkConnection();
    } catch (error) {
      throw new ServiceUnavailableError('Database is not ready', {
        cause: error,
      });
    }

    return {
      service: 'backend',
      status: 'ready',
      database: 'connected',
    };
  }

  public async recordStarted(instanceId: string): Promise<void> {
    await this.repository.recordStarted(instanceId);
  }

  public async recordStopped(instanceId: string): Promise<void> {
    await this.repository.recordStopped(instanceId);
  }
}
