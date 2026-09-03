import { describe, expect, it } from 'vitest';

import type { BacktestJobQueue } from '../../../src/queue/PostgresJobQueue';
import { createAppLogger } from '../../../src/utils/logger';
import { BacktestWorker } from '../../../src/worker/BacktestWorker';
import type {
  BacktestExecutionInput,
  ClaimedBacktestJob,
  PersistedBacktestOutcome,
} from '../../../src/worker/types';

const logger = createAppLogger({ enabled: false, service: 'worker-test' });

function makeJob(): ClaimedBacktestJob {
  return {
    claimedAt: new Date(),
    createdAt: new Date(),
    error: null,
    experimentId: 'experiment-1',
    id: 'job-1',
    leaseExpiresAt: new Date(Date.now() + 60_000),
    leaseToken: 'lease-1',
    retryCount: 1,
    status: 'CLAIMED',
    workerId: 'worker-1',
  };
}

function makeInput(
  overrides: Partial<BacktestExecutionInput> = {},
): BacktestExecutionInput {
  return {
    buildRevision: 'dev',
    candles: [
      {
        close: 101,
        closeTime: 59_999,
        high: 102,
        isClosed: true,
        low: 99,
        open: 100,
        openTime: 0,
        pair: 'BTCUSDT',
        timeframe: '1m',
        volume: 10,
      },
      {
        close: 103,
        closeTime: 119_999,
        high: 104,
        isClosed: true,
        low: 100,
        open: 101,
        openTime: 60_000,
        pair: 'BTCUSDT',
        timeframe: '1m',
        volume: 10,
      },
    ],
    endTime: 120_000,
    evaluatorVersion: 'default-v1',
    experimentId: 'experiment-1',
    initialInvestment: 1_000,
    jobId: 'job-1',
    pair: 'BTCUSDT',
    simulationRulesVersion: 'historical-v1',
    slippage: 5,
    startTime: 0,
    strategyId: 'ma',
    strategyImplementationVersion: 'ma-v1',
    strategyParams: { fast: 2, slow: 3 },
    strategyVersionId: 'version-1',
    timeframe: '1m',
    transactionCost: 0.0008,
    ...overrides,
  };
}

interface FakeQueue extends BacktestJobQueue {
  completed: PersistedBacktestOutcome[];
  failures: { error: Error; category: string | undefined }[];
}

function makeQueue(input: BacktestExecutionInput): FakeQueue {
  const completed: PersistedBacktestOutcome[] = [];
  const failures: { error: Error; category: string | undefined }[] = [];
  let claimed = false;
  return {
    completed,
    async claim() {
      if (claimed) return null;
      claimed = true;
      return makeJob();
    },
    async complete() {},
    async completeClaim(_job, outcome) {
      completed.push(outcome);
      return true;
    },
    async enqueue() {
      return 'job-1';
    },
    async fail() {},
    async failClaim(_job, error, category) {
      failures.push({ category, error });
      return true;
    },
    failures,
    async loadInput() {
      return input;
    },
    async renew() {
      return true;
    },
    async start() {},
  };
}

async function runOneJob(
  queue: FakeQueue,
  worker: BacktestWorker,
): Promise<void> {
  worker.start();
  const deadline = Date.now() + 2_000;
  while (
    queue.completed.length === 0 &&
    queue.failures.length === 0 &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  await worker.stop();
}

describe('BacktestWorker execution versions', () => {
  it('completes a job whose recorded versions match this worker', async () => {
    const input = makeInput();
    const queue = makeQueue(input);
    const worker = new BacktestWorker('worker-1', queue, logger, {
      pollIntervalMs: 10,
    });

    await runOneJob(queue, worker);

    expect(queue.completed).toHaveLength(1);
    expect(queue.failures).toHaveLength(0);
  });

  it('runs a legacy job with no recorded Strategy implementation version under the current implementation', async () => {
    const input = makeInput({ strategyImplementationVersion: null });
    const queue = makeQueue(input);
    const worker = new BacktestWorker('worker-1', queue, logger, {
      pollIntervalMs: 10,
    });

    await runOneJob(queue, worker);

    expect(queue.completed).toHaveLength(1);
    expect(queue.failures).toHaveLength(0);
  });

  it('fails permanently with UNSUPPORTED_VERSION when the recorded Strategy implementation version is unavailable', async () => {
    const input = makeInput({ strategyImplementationVersion: 'ma-v99' });
    const queue = makeQueue(input);
    const worker = new BacktestWorker('worker-1', queue, logger, {
      pollIntervalMs: 10,
    });

    await runOneJob(queue, worker);

    expect(queue.completed).toHaveLength(0);
    expect(queue.failures).toHaveLength(1);
    expect(queue.failures[0]?.category).toBe('PERMANENT');
    expect(queue.failures[0]?.error.message).toContain('UNSUPPORTED_VERSION');
    expect(queue.failures[0]?.error.message).toContain('ma-v99');
  });

  it('fails permanently with UNSUPPORTED_VERSION when the recorded Simulation Rules version is unavailable', async () => {
    const input = makeInput({ simulationRulesVersion: 'historical-v99' });
    const queue = makeQueue(input);
    const worker = new BacktestWorker('worker-1', queue, logger, {
      pollIntervalMs: 10,
    });

    await runOneJob(queue, worker);

    expect(queue.completed).toHaveLength(0);
    expect(queue.failures).toHaveLength(1);
    expect(queue.failures[0]?.category).toBe('PERMANENT');
    expect(queue.failures[0]?.error.message).toContain('UNSUPPORTED_VERSION');
  });

  it('fails permanently with UNSUPPORTED_VERSION when the recorded Evaluator version is unavailable', async () => {
    const input = makeInput({ evaluatorVersion: 'default-v99' });
    const queue = makeQueue(input);
    const worker = new BacktestWorker('worker-1', queue, logger, {
      pollIntervalMs: 10,
    });

    await runOneJob(queue, worker);

    expect(queue.completed).toHaveLength(0);
    expect(queue.failures).toHaveLength(1);
    expect(queue.failures[0]?.category).toBe('PERMANENT');
    expect(queue.failures[0]?.error.message).toContain('UNSUPPORTED_VERSION');
  });

  it('fails permanently with UNSUPPORTED_VERSION when the recorded build revision is not compatible', async () => {
    const input = makeInput({ buildRevision: 'other-build' });
    const queue = makeQueue(input);
    const worker = new BacktestWorker('worker-1', queue, logger, {
      buildRevision: 'this-build',
      pollIntervalMs: 10,
    });

    await runOneJob(queue, worker);

    expect(queue.completed).toHaveLength(0);
    expect(queue.failures).toHaveLength(1);
    expect(queue.failures[0]?.category).toBe('PERMANENT');
    expect(queue.failures[0]?.error.message).toContain('UNSUPPORTED_VERSION');
    expect(queue.failures[0]?.error.message).toContain('other-build');
  });

  it('completes a job whose recorded build revision matches this worker', async () => {
    const input = makeInput({ buildRevision: 'this-build' });
    const queue = makeQueue(input);
    const worker = new BacktestWorker('worker-1', queue, logger, {
      buildRevision: 'this-build',
      pollIntervalMs: 10,
    });

    await runOneJob(queue, worker);

    expect(queue.completed).toHaveLength(1);
    expect(queue.failures).toHaveLength(0);
  });
});
