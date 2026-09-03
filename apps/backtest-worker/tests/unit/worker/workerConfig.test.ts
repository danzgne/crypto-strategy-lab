import { describe, expect, it } from 'vitest';
import {
  generateWorkerId,
  readWorkerConfig,
} from '../../../src/config/workerConfig';

describe('workerConfig', () => {
  it('generates unique worker identities when not specified', () => {
    const id1 = generateWorkerId();
    const id2 = generateWorkerId();
    expect(id1).toMatch(/^backtest-worker-/);
    expect(id2).toMatch(/^backtest-worker-/);
    expect(id1).not.toBe(id2);
  });

  it('auto-generates worker ID if WORKER_ID is empty or undefined in env', () => {
    const config = readWorkerConfig({
      DATABASE_URL: 'postgresql://dummy',
    });
    expect(config.workerId).toMatch(/^backtest-worker-/);
  });

  it('uses explicitly provided WORKER_ID', () => {
    const config = readWorkerConfig({
      DATABASE_URL: 'postgresql://dummy',
      WORKER_ID: 'custom-worker-42',
    });
    expect(config.workerId).toBe('custom-worker-42');
  });
});
