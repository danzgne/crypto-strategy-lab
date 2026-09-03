import { describe, expect, it, vi } from 'vitest';

import { HealthService } from '@/api/features/health/services/healthService';
import type { HealthRepository } from '@/api/features/health/repositories/interfaces/healthRepository.interface';

describe('HealthService lifecycle persistence', () => {
  it('records backend startup, heartbeat, and shutdown through its repository', async () => {
    const repository: HealthRepository = {
      checkConnection: vi.fn().mockResolvedValue(undefined),
      recordStarted: vi.fn().mockResolvedValue(undefined),
      recordHeartbeat: vi.fn().mockResolvedValue(undefined),
      recordStopped: vi.fn().mockResolvedValue(undefined),
    };
    const service = new HealthService(repository);

    await service.recordStarted('backend-test-1');
    await service.recordHeartbeat('backend-test-1');
    await service.recordStopped('backend-test-1');

    expect(repository.recordStarted).toHaveBeenCalledWith('backend-test-1');
    expect(repository.recordHeartbeat).toHaveBeenCalledWith('backend-test-1');
    expect(repository.recordStopped).toHaveBeenCalledWith('backend-test-1');
  });
});
