import { randomUUID } from 'node:crypto';
import { config as loadEnvironment } from 'dotenv';
import '@crypto-strategy-lab/strategy-engine/strategies';

import { createPrismaClient } from '../database/prismaClient';
import { PrismaJobRepository } from '../repositories/prisma/prismaJobRepository';
import { PostgresJobQueue } from '../queue/PostgresJobQueue';
import { BacktestWorker } from '../worker/BacktestWorker';
import { PrismaServiceHeartbeatRepository } from '../repositories/prisma/prismaServiceHeartbeatRepository';
import { createAppLogger } from '../utils/logger';
import { generateWorkerId } from '../config/workerConfig';
import {
  formatHumanReport,
  formatJsonReport,
  getMachineContext,
  type BenchmarkMetrics,
} from './benchmarkReport';

loadEnvironment({
  path: new URL('../../../../.env', import.meta.url),
  quiet: true,
});

export interface BenchmarkOptions {
  jobs?: number;
  batchSize?: number;
  workers?: number;
  cleanup?: boolean;
  pollIntervalMs?: number;
  outputJsonPath?: string;
  silent?: boolean;
}

export async function executeBenchmark(
  options: BenchmarkOptions = {},
): Promise<BenchmarkMetrics> {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_BENCHMARK !== 'true'
  ) {
    throw new Error(
      'Benchmark is guarded. Set ALLOW_BENCHMARK=true to run in production.',
    );
  }

  const totalJobs = Math.max(1, options.jobs ?? 100_000);
  const batchSize = Math.max(100, Math.min(10_000, options.batchSize ?? 5_000));
  const workerCount = options.workers ?? 0;
  const shouldCleanup = options.cleanup ?? true;
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const silent = options.silent ?? false;

  const databaseUrl =
    process.env.DATABASE_URL ||
    'postgresql://crypto_lab:crypto_lab@localhost:5434/crypto_strategy_lab?schema=public';
  const prisma = createPrismaClient(databaseUrl);
  const logger = createAppLogger({ service: 'benchmark', enabled: false });
  const heartbeatRepo = new PrismaServiceHeartbeatRepository(prisma);

  const benchmarkId = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      email: `bench-${benchmarkId}-${Date.now()}@example.com`,
      passwordHash: 'benchmark',
      role: 'USER',
    },
  });
  const ownerId = user.id;

  const definition = await prisma.strategyDefinition.create({
    data: {
      name: `Benchmark MA Strategy ${benchmarkId}`,
      ownerId,
      source: 'USER_PROMPT',
      sourceInput: 'Benchmark synthetic strategy',
      tags: ['benchmark'],
      type: 'ma',
    },
  });

  const version = await prisma.strategyVersion.create({
    data: {
      libraryVersion: '1.0.0',
      ownerId,
      params: { fast: 5, slow: 10 },
      strategyDefinitionId: definition.id,
      versionTag: `bench-v1-${benchmarkId}`,
    },
  });

  const snapshot = await prisma.datasetSnapshot.create({
    data: {
      candles: [
        {
          close: 100,
          closeTime: 59_999,
          high: 101,
          isClosed: true,
          low: 99,
          open: 100,
          openTime: 0,
          pair: 'BTCUSDT',
          timeframe: '1m',
          volume: 10,
        },
        {
          close: 102,
          closeTime: 119_999,
          high: 103,
          isClosed: true,
          low: 100,
          open: 101,
          openTime: 60_000,
          pair: 'BTCUSDT',
          timeframe: '1m',
          volume: 12,
        },
        {
          close: 101,
          closeTime: 179_999,
          high: 102,
          isClosed: true,
          low: 99,
          open: 102,
          openTime: 120_000,
          pair: 'BTCUSDT',
          timeframe: '1m',
          volume: 8,
        },
      ],
      endTime: 180_000,
      fingerprint: `bench-snapshot-${benchmarkId}`,
      pair: 'BTCUSDT',
      startTime: 0,
      timeframe: '1m',
      warmupCandleCount: 0,
    },
  });

  if (!silent) {
    process.stdout.write(
      `Creating synthetic campaign of ${totalJobs.toLocaleString()} jobs in batches of ${batchSize}...\n`,
    );
  }

  // Bulk populate experiments and jobs
  let createdCount = 0;
  while (createdCount < totalJobs) {
    const currentChunkSize = Math.min(batchSize, totalJobs - createdCount);
    const experimentData = Array.from({ length: currentChunkSize }, () => ({
      datasetSnapshotId: snapshot.id,
      endTime: 180_000,
      initialInvestment: 100,
      ownerId,
      pair: 'BTCUSDT' as const,
      slippage: 0,
      startTime: 0,
      strategyVersionId: version.id,
      timeframe: '1m' as const,
      transactionCost: 0,
    }));

    await prisma.experiment.createMany({ data: experimentData });

    // Fetch the created experiment IDs for this owner without an attached backtestJob
    const experiments = await prisma.experiment.findMany({
      select: { id: true },
      where: {
        ownerId,
        backtestJob: null,
      },
      take: currentChunkSize,
    });

    const jobData = experiments.map((exp) => ({
      experimentId: exp.id,
      ownerId,
      status: 'PENDING' as const,
    }));

    await prisma.backtestJob.createMany({ data: jobData });
    createdCount += currentChunkSize;

    if (!silent) {
      process.stdout.write(
        `  Enqueued: ${createdCount.toLocaleString()} / ${totalJobs.toLocaleString()}\n`,
      );
    }
  }

  const workers: BacktestWorker[] = [];
  const workerIds: string[] = [];

  if (workerCount > 0) {
    if (!silent) {
      process.stdout.write(
        `Starting ${workerCount} in-process backtest worker(s)...\n`,
      );
    }
    for (let i = 0; i < workerCount; i++) {
      const wId = generateWorkerId();
      workerIds.push(wId);
      await heartbeatRepo.recordStarted(wId);

      const jobRepo = new PrismaJobRepository(prisma);
      const queue = new PostgresJobQueue(jobRepo);
      const worker = new BacktestWorker(
        wId,
        queue,
        logger,
        undefined,
        undefined,
        {
          pollIntervalMs: 50,
          maxPollIntervalMs: 500,
        },
      );
      worker.start();
      workers.push(worker);
    }
  } else if (!silent) {
    process.stdout.write(
      'Waiting for external workers (Docker Compose or separate processes) to process jobs...\n',
    );
  }

  const startTime = Date.now();
  let peakConnections = 1;

  try {
    // Monitor progress
    while (true) {
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

      // Sample active connections
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
  } finally {
    for (const worker of workers) {
      await worker.stop();
    }
    for (const wId of workerIds) {
      await heartbeatRepo.recordStopped(wId);
    }
  }

  const wallTimeSeconds = (Date.now() - startTime) / 1000;
  if (!silent) {
    process.stdout.write(
      '\nProcessing complete. Gathering benchmark metrics...\n',
    );
  }

  // Calculate aggregated metrics
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
      SELECT "experimentId"
      FROM backtest_jobs
      WHERE "ownerId" = ${ownerId}
      GROUP BY "experimentId"
      HAVING count(*) > 1
    ) d;
  `;

  const lostJobsResult = await prisma.$queryRaw<Array<{ count: number }>>`
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
  const lostJobs = Number(lostJobsResult[0]?.count ?? 0);
  const totalRetries = Number(retriesResult[0]?.count ?? 0);
  const recordedWorkerCount = Number(workerCountResult[0]?.count ?? 0);
  const p95QueueWaitMs = Number(p95WaitResult[0]?.p95Wait ?? 0);
  const p95ExecutionDurationMs = Number(p95DurationResult[0]?.p95Duration ?? 0);

  const metrics: BenchmarkMetrics = {
    totalJobs,
    completedJobs,
    failedJobs,
    lostJobs,
    duplicates,
    totalRetries,
    workerCount: recordedWorkerCount || workerCount,
    datasetCandleCount: Array.isArray(snapshot.candles)
      ? snapshot.candles.length
      : 0,
    wallTimeSeconds,
    throughputJobsPerSecond:
      wallTimeSeconds > 0 ? completedJobs / wallTimeSeconds : 0,
    p95QueueWaitMs,
    p95ExecutionDurationMs,
    peakPostgresConnections: peakConnections,
    machineContext: getMachineContext(),
  };

  if (shouldCleanup) {
    if (!silent)
      process.stdout.write('Cleaning up synthetic benchmark data...\n');
    await prisma.leaderboard.deleteMany({
      where: { ownerId },
    });
    await prisma.trade.deleteMany({
      where: { ownerId },
    });
    await prisma.backtestJob.deleteMany({
      where: { ownerId },
    });

    const benchExperiments = await prisma.experiment.findMany({
      select: { id: true },
      where: { ownerId },
    });
    const benchExpIds = benchExperiments.map((e) => e.id);

    if (benchExpIds.length > 0) {
      const outbox = await prisma.outboxEvent.findMany({
        where: {
          name: {
            in: ['BacktestStarted', 'BacktestCompleted', 'StrategyEvaluated'],
          },
        },
      });
      const toDelete = outbox
        .filter((e) => {
          const payload = e.payload as { experimentId?: unknown };
          return (
            typeof payload?.experimentId === 'string' &&
            benchExpIds.includes(payload.experimentId)
          );
        })
        .map((e) => e.id);
      if (toDelete.length > 0) {
        await prisma.outboxEvent.deleteMany({
          where: { id: { in: toDelete } },
        });
      }
    }

    await prisma.experiment.deleteMany({
      where: { ownerId },
    });
    await prisma.datasetSnapshot.deleteMany({
      where: { id: snapshot.id },
    });
    await prisma.strategyVersion.deleteMany({
      where: { id: version.id },
    });
    await prisma.strategyDefinition.deleteMany({
      where: { id: definition.id },
    });
    await prisma.leaderboard.deleteMany({
      where: { ownerId },
    });
    await prisma.user.deleteMany({
      where: { id: ownerId },
    });
  }

  await prisma.$disconnect();
  return metrics;
}

// CLI entrypoint if executed directly
if (process.argv[1]?.endsWith('runBenchmark.ts')) {
  const args = process.argv.slice(2);
  const jobsArg =
    args.find((a) => a.startsWith('--jobs='))?.split('=')[1] ??
    args[args.indexOf('--jobs') + 1];
  const workersArg =
    args.find((a) => a.startsWith('--workers='))?.split('=')[1] ??
    args[args.indexOf('--workers') + 1];
  const batchArg =
    args.find((a) => a.startsWith('--batch-size='))?.split('=')[1] ??
    args[args.indexOf('--batch-size') + 1];
  const noCleanup = args.includes('--no-cleanup');
  const jsonOnly = args.includes('--json');

  const jobs = jobsArg ? parseInt(jobsArg, 10) : 100_000;
  const workers = workersArg ? parseInt(workersArg, 10) : 0;
  const batchSize = batchArg ? parseInt(batchArg, 10) : 5_000;

  executeBenchmark({
    jobs,
    workers,
    batchSize,
    cleanup: !noCleanup,
  })
    .then((metrics) => {
      if (jsonOnly) {
        process.stdout.write(formatJsonReport(metrics) + '\n');
      } else {
        process.stdout.write(formatHumanReport(metrics) + '\n');
      }
    })
    .catch((err) => {
      process.stderr.write(`Benchmark error: ${String(err)}\n`);
      process.exit(1);
    });
}
