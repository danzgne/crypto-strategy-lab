import type { WorkerPrismaClient } from '../database/prismaClient';
import { getMachineContext, type BenchmarkMetrics } from './benchmarkReport';

export interface WaitForBenchmarkCompletionOptions {
  ownerId: string;
  totalJobs: number;
  pollIntervalMs?: number;
  silent?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface BenchmarkCompletionResult {
  wallTimeSeconds: number;
  peakConnections: number;
}

/**
 * Polls backtest_jobs until all jobs are either COMPLETED or FAILED,
 * sampling active PostgreSQL connections along the way.
 */
export async function waitForBenchmarkCompletion(
  prisma: WorkerPrismaClient,
  options: WaitForBenchmarkCompletionOptions,
): Promise<BenchmarkCompletionResult> {
  const {
    ownerId,
    totalJobs,
    pollIntervalMs = 500,
    silent = false,
    timeoutMs,
    signal,
  } = options;
  const startTime = Date.now();
  let peakConnections = 1;

  while (true) {
    const elapsedMs = Date.now() - startTime;
    if (timeoutMs !== undefined && elapsedMs > timeoutMs) {
      throw new Error(
        `Benchmark timed out after ${(elapsedMs / 1000).toFixed(1)}s waiting for ${totalJobs} jobs`,
      );
    }
    if (signal?.aborted) {
      throw new Error('Benchmark wait cancelled');
    }

    const counts = await prisma.$queryRaw<
      Array<{ status: string; count: bigint | number }>
    >`
      SELECT status, count(*)::int as count
      FROM backtest_jobs
      WHERE "ownerId" = ${ownerId}
      GROUP BY status;
    `;

    let pending = 0;
    let claimed = 0;
    let completed = 0;
    let failed = 0;

    for (const row of counts) {
      const count = Number(row.count);
      if (row.status === 'PENDING') pending = count;
      if (row.status === 'CLAIMED') claimed = count;
      if (row.status === 'COMPLETED') completed = count;
      if (row.status === 'FAILED') failed = count;
    }

    try {
      const connCountRaw = await prisma.$queryRaw<
        Array<{ count: bigint | number }>
      >`
        SELECT count(*)::int as count
        FROM pg_stat_activity
        WHERE state = 'active';
      `;
      const currentConns = Number(connCountRaw[0]?.count ?? 1);
      if (currentConns > peakConnections) peakConnections = currentConns;
    } catch {
      // Ignore pg_stat_activity permissions issues if any
    }

    const finished = completed + failed;
    if (!silent) {
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate =
        finished > 0 ? (finished / Number(elapsedSec)).toFixed(1) : '0';
      process.stdout.write(
        `[${elapsedSec}s] Finished: ${finished.toLocaleString()}/${totalJobs.toLocaleString()} (Pending: ${pending}, Claimed: ${claimed}, Done: ${completed}, Failed: ${failed}) ~${rate} j/s\r`,
      );
    }

    if (finished >= totalJobs) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  const wallTimeSeconds = (Date.now() - startTime) / 1000;
  return { wallTimeSeconds, peakConnections };
}

export interface GatherBenchmarkMetricsOptions {
  ownerId: string;
  totalJobs: number;
  workerCount: number;
  datasetCandleCount: number;
  wallTimeSeconds: number;
  peakConnections?: number;
}

/**
 * Computes verified benchmark metrics directly from the PostgreSQL database,
 * including P95 queue wait and execution duration percentiles.
 */
export async function gatherBenchmarkMetrics(
  prisma: WorkerPrismaClient,
  options: GatherBenchmarkMetricsOptions,
): Promise<BenchmarkMetrics> {
  const {
    ownerId,
    totalJobs,
    workerCount,
    datasetCandleCount,
    wallTimeSeconds,
    peakConnections = 1,
  } = options;

  const p95WaitResult = await prisma.$queryRaw<
    Array<{ p95Wait: number | null }>
  >`
    SELECT COALESCE(
      PERCENTILE_CONT(0.95) WITHIN GROUP (
        ORDER BY (EXTRACT(EPOCH FROM ("claimedAt" - "createdAt")) * 1000)
      ),
      0
    )::float AS "p95Wait"
    FROM backtest_jobs
    WHERE "ownerId" = ${ownerId} AND "claimedAt" IS NOT NULL;
  `;

  const p95DurationResult = await prisma.$queryRaw<
    Array<{ p95Duration: number | null }>
  >`
    SELECT COALESCE(
      PERCENTILE_CONT(0.95) WITHIN GROUP (
        ORDER BY (EXTRACT(EPOCH FROM ("updatedAt" - "claimedAt")) * 1000)
      ),
      0
    )::float AS "p95Duration"
    FROM backtest_jobs
    WHERE "ownerId" = ${ownerId} AND "claimedAt" IS NOT NULL AND status IN ('COMPLETED', 'FAILED');
  `;

  const duplicatesResult = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT count(*)::int AS count
    FROM (
      SELECT payload->>'jobId' AS "jobId"
      FROM event_outbox
      WHERE name = 'BacktestCompleted'
        AND payload->>'experimentId' IN (
          SELECT id::text FROM experiments WHERE "ownerId" = ${ownerId}
        )
      GROUP BY payload->>'jobId'
      HAVING count(*) > 1
    ) d;
  `;

  const uncompletedCountResult = await prisma.$queryRaw<
    Array<{ count: number }>
  >`
    SELECT count(*)::int AS count
    FROM backtest_jobs
    WHERE "ownerId" = ${ownerId} AND status NOT IN ('COMPLETED', 'FAILED');
  `;

  const retriesResult = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COALESCE(sum("retryCount"), 0)::int AS count
    FROM backtest_jobs
    WHERE "ownerId" = ${ownerId};
  `;

  const workerCountResult = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT count(DISTINCT "workerId")::int AS count
    FROM backtest_jobs
    WHERE "ownerId" = ${ownerId} AND "workerId" IS NOT NULL;
  `;

  const completedCountResult = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT count(*)::int AS count
    FROM backtest_jobs
    WHERE "ownerId" = ${ownerId} AND status = 'COMPLETED';
  `;

  const failedCountResult = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT count(*)::int AS count
    FROM backtest_jobs
    WHERE "ownerId" = ${ownerId} AND status = 'FAILED';
  `;

  const completedJobs = Number(completedCountResult[0]?.count ?? 0);
  const failedJobs = Number(failedCountResult[0]?.count ?? 0);
  const duplicates = Number(duplicatesResult[0]?.count ?? 0);
  const uncompletedJobs = Number(uncompletedCountResult[0]?.count ?? 0);
  const lostJobs = Math.max(
    uncompletedJobs,
    Math.max(0, totalJobs - (completedJobs + failedJobs)),
  );
  const totalRetries = Number(retriesResult[0]?.count ?? 0);
  const recordedWorkerCount = Number(workerCountResult[0]?.count ?? 0);
  const p95QueueWaitMs = Number(p95WaitResult[0]?.p95Wait ?? 0);
  const p95ExecutionDurationMs = Number(p95DurationResult[0]?.p95Duration ?? 0);

  return {
    totalJobs,
    completedJobs,
    failedJobs,
    lostJobs,
    duplicates,
    totalRetries,
    workerCount: recordedWorkerCount || workerCount,
    datasetCandleCount,
    wallTimeSeconds,
    throughputJobsPerSecond:
      wallTimeSeconds > 0 ? completedJobs / wallTimeSeconds : 0,
    p95QueueWaitMs,
    p95ExecutionDurationMs,
    peakPostgresConnections: peakConnections,
    machineContext: getMachineContext(),
  };
}

export interface CleanupBenchmarkOptions {
  ownerId: string;
  snapshotId?: string;
  versionIds?: string[];
  definitionIds?: string[];
  silent?: boolean;
  onProgress?: (message: string) => void;
}

async function withDeadlockRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: unknown) {
      attempt++;
      const isDeadlock =
        err instanceof Error &&
        (err.message.includes('deadlock') ||
          (err as { code?: string }).code === '40P01');
      if (attempt >= maxRetries || !isDeadlock) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
  }
}

/**
 * Cleans up all disposable entities created during a benchmark campaign.
 */
export async function cleanupBenchmarkCampaign(
  prisma: WorkerPrismaClient,
  options: CleanupBenchmarkOptions,
): Promise<void> {
  const { ownerId, snapshotId, versionIds, definitionIds, onProgress } =
    options;
  if (onProgress) {
    onProgress('Cleaning up synthetic benchmark data...\n');
  }

  await withDeadlockRetry(() =>
    prisma.leaderboard.deleteMany({
      where: { ownerId },
    }),
  );
  await withDeadlockRetry(() =>
    prisma.trade.deleteMany({
      where: { ownerId },
    }),
  );
  await withDeadlockRetry(() =>
    prisma.backtestJob.deleteMany({
      where: { ownerId },
    }),
  );

  await withDeadlockRetry(
    () =>
      prisma.$executeRaw`
      DELETE FROM event_outbox
      WHERE name IN ('BacktestStarted', 'BacktestCompleted', 'StrategyEvaluated')
        AND payload->>'experimentId' IN (
          SELECT id::text FROM experiments WHERE "ownerId" = ${ownerId}
        );
    `,
  );

  await withDeadlockRetry(() =>
    prisma.experiment.deleteMany({
      where: { ownerId },
    }),
  );

  if (snapshotId) {
    await withDeadlockRetry(() =>
      prisma.datasetSnapshot.deleteMany({
        where: { id: snapshotId },
      }),
    );
  }

  if (versionIds && versionIds.length > 0) {
    await withDeadlockRetry(() =>
      prisma.strategyVersion.deleteMany({
        where: { id: { in: versionIds } },
      }),
    );
  }

  if (definitionIds && definitionIds.length > 0) {
    await withDeadlockRetry(() =>
      prisma.strategyDefinition.deleteMany({
        where: { id: { in: definitionIds } },
      }),
    );
  }

  await withDeadlockRetry(() =>
    prisma.leaderboard.deleteMany({
      where: { ownerId },
    }),
  );
  await withDeadlockRetry(() =>
    prisma.user.deleteMany({
      where: { id: ownerId },
    }),
  );
}
