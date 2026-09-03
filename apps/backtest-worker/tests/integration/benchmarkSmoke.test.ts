import { describe, expect, it } from 'vitest';
import { executeBenchmark } from '../../src/benchmark/runBenchmark';

describe('benchmark smoke test', () => {
  it('runs a small synthetic campaign and produces valid metrics', async () => {
    const metrics = await executeBenchmark({
      jobs: 10,
      batchSize: 5,
      workers: 1,
      silent: true,
      cleanup: true,
    });

    expect(metrics.totalJobs).toBe(10);
    expect(metrics.completedJobs).toBe(10);
    expect(metrics.failedJobs).toBe(0);
    expect(metrics.lostJobs).toBe(0);
    expect(metrics.duplicates).toBe(0);
    expect(metrics.throughputJobsPerSecond).toBeGreaterThan(0);
    expect(metrics.p95QueueWaitMs).toBeGreaterThanOrEqual(0);
    expect(metrics.p95ExecutionDurationMs).toBeGreaterThanOrEqual(0);
    expect(metrics.machineContext.cpuCores).toBeGreaterThan(0);
    expect(metrics.machineContext.hostname.length).toBeGreaterThan(0);
  });

  it('aborts and cleans up when benchmark times out', async () => {
    await expect(
      executeBenchmark({
        jobs: 10,
        batchSize: 5,
        workers: 0, // No workers processing jobs
        silent: true,
        cleanup: true,
        timeoutMs: 150,
      }),
    ).rejects.toThrow(/timed out/i);
  });
});
