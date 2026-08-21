import { describe, expect, it, vi } from 'vitest';

import { HealthService } from '../../../../src/api/features/health/services/healthService';
import type { HealthRepository } from '../../../../src/api/features/health/repositories/interfaces/healthRepository.interface';

describe('HealthService lifecycle persistence', () => {
  it('records backend startup and shutdown through its repository', async () => {
    const repository: HealthRepository = {
      checkConnection: vi.fn().mockResolvedValue(undefined),
      recordStarted: vi.fn().mockResolvedValue(undefined),
      recordStopped: vi.fn().mockResolvedValue(undefined),
    };
    const service = new HealthService(repository);

    await service.recordStarted('backend-test-1');
    await service.recordStopped('backend-test-1');

    expect(repository.recordStarted).toHaveBeenCalledWith('backend-test-1');
    expect(repository.recordStopped).toHaveBeenCalledWith('backend-test-1');
  });
});
