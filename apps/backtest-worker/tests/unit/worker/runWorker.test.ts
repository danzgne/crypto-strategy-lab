import { describe, expect, it, vi } from 'vitest';

import { createAppLogger } from '../../../src/utils/logger';
import { runWorker } from '../../../src/worker/runWorker';

describe('runWorker', () => {
  it('connects, registers the process, and disconnects cleanly on abort', async () => {
    const calls: string[] = [];
    const abortController = new AbortController();
    const database = {
      connect: vi.fn(async () => {
        calls.push('connect');
      }),
      disconnect: vi.fn(async () => {
        calls.push('disconnect');
      }),
    };
    const heartbeatRepository = {
      recordStarted: vi.fn(async () => {
        calls.push('started');
        abortController.abort();
      }),
      recordHeartbeat: vi.fn(async () => {
        calls.push('heartbeat');
      }),
      recordStopped: vi.fn(async () => {
        calls.push('stopped');
      }),
    };

    await runWorker(
      {
        workerId: 'worker-test-27',
        heartbeatIntervalMs: 10_000,
      },
      {
        database,
        heartbeatRepository,
        logger: createAppLogger({ service: 'worker-test', enabled: false }),
      },
      abortController.signal,
    );

    expect(calls).toEqual(['connect', 'started', 'stopped', 'disconnect']);
    expect(heartbeatRepository.recordStarted).toHaveBeenCalledWith(
      'worker-test-27',
    );
    expect(heartbeatRepository.recordStopped).toHaveBeenCalledWith(
      'worker-test-27',
    );
  });
});
