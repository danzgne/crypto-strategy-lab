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
  type BenchmarkMetrics,
} from './benchmarkReport';
import {
  cleanupBenchmarkCampaign,
  gatherBenchmarkMetrics,
  waitForBenchmarkCompletion,
} from './benchmarkHelpers';

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
  timeoutMs?: number;
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
  const batchSize = Math.max(1, Math.min(10_000, options.batchSize ?? 5_000));
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

  const workers: BacktestWorker[] = [];
  const workerIds: string[] = [];
  let ownerId: string | undefined;
  let definition: { id: string } | undefined;
  let version: { id: string } | undefined;
  let snapshot: { id: string; candles: unknown } | undefined;

  const abortController = new AbortController();
  const onSignal = (): void => {
    abortController.abort();
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    const benchmarkId = randomUUID().slice(0, 8);
    const user = await prisma.user.create({
      data: {
        email: `bench-${benchmarkId}-${Date.now()}@example.com`,
        passwordHash: 'benchmark',
        role: 'USER',
      },
    });
    const currentOwnerId = user.id;
    ownerId = currentOwnerId;

    const def = await prisma.strategyDefinition.create({
      data: {
        name: `Benchmark MA Strategy ${benchmarkId}`,
        ownerId: currentOwnerId,
        source: 'USER_PROMPT',
        sourceInput: 'Benchmark synthetic strategy',
        tags: ['benchmark'],
        type: 'ma',
      },
    });
    definition = def;

    const ver = await prisma.strategyVersion.create({
      data: {
        libraryVersion: '1.0.0',
        ownerId: currentOwnerId,
        params: { fast: 5, slow: 10 },
        strategyDefinitionId: def.id,
        versionTag: `bench-v1-${benchmarkId}`,
      },
    });
    version = ver;

    const snap = await prisma.datasetSnapshot.create({
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
    snapshot = snap;

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
        datasetSnapshotId: snap.id,
        endTime: 180_000,
        initialInvestment: 100,
        ownerId: currentOwnerId,
        pair: 'BTCUSDT' as const,
        slippage: 0,
        startTime: 0,
        strategyVersionId: ver.id,
        timeframe: '1m' as const,
        transactionCost: 0,
      }));

      await prisma.experiment.createMany({ data: experimentData });

      // Fetch the created experiment IDs for this owner without an attached backtestJob
      const experiments = await prisma.experiment.findMany({
        select: { id: true },
        where: {
          ownerId: currentOwnerId,
          backtestJob: null,
        },
        take: currentChunkSize,
      });

      const jobData = experiments.map((exp) => ({
        experimentId: exp.id,
        ownerId: currentOwnerId,
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

    const timeoutMs = options.timeoutMs ?? Math.max(60_000, totalJobs * 100);

    const completionResult = await waitForBenchmarkCompletion(prisma, {
      ownerId,
      pollIntervalMs,
      silent,
      signal: abortController.signal,
      timeoutMs,
      totalJobs,
    });

    if (!silent) {
      process.stdout.write(
        '\nProcessing complete. Gathering benchmark metrics...\n',
      );
    }

    const metrics = await gatherBenchmarkMetrics(prisma, {
      datasetCandleCount: Array.isArray(snapshot.candles)
        ? snapshot.candles.length
        : 0,
      ownerId,
      peakConnections: completionResult.peakConnections,
      totalJobs,
      wallTimeSeconds: completionResult.wallTimeSeconds,
      workerCount,
    });

    return metrics;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    for (const worker of workers) {
      await worker.stop();
    }
    for (const wId of workerIds) {
      await heartbeatRepo.recordStopped(wId);
    }
    if (shouldCleanup && ownerId) {
      await cleanupBenchmarkCampaign(prisma, {
        ownerId,
        silent,
        ...(definition ? { definitionIds: [definition.id] } : {}),
        ...(snapshot ? { snapshotId: snapshot.id } : {}),
        ...(version ? { versionIds: [version.id] } : {}),
      });
    }
    await prisma.$disconnect();
  }
}

// CLI entrypoint if executed directly
if (process.argv[1]?.endsWith('runBenchmark.ts')) {
  const args = process.argv.slice(2);

  const getArgValue = (name: string): string | undefined => {
    const withEqual = args.find((a) => a.startsWith(`${name}=`));
    if (withEqual) {
      return withEqual.slice(name.length + 1);
    }
    const idx = args.indexOf(name);
    if (idx !== -1 && idx + 1 < args.length) {
      return args[idx + 1];
    }
    return undefined;
  };

  const jobsArg = getArgValue('--jobs');
  const workersArg = getArgValue('--workers');
  const batchArg = getArgValue('--batch-size');
  const noCleanup = args.includes('--no-cleanup');
  const jsonOnly = args.includes('--json');

  const jobs = jobsArg ? parseInt(jobsArg, 10) : 100_000;
  const workers = workersArg ? parseInt(workersArg, 10) : 0;
  const batchSize = batchArg ? parseInt(batchArg, 10) : 5_000;

  const timeoutArg =
    getArgValue('--timeout') ?? getArgValue('--timeout-seconds');
  const timeoutMs = timeoutArg ? parseInt(timeoutArg, 10) * 1000 : undefined;

  executeBenchmark({
    jobs,
    workers,
    batchSize,
    cleanup: !noCleanup,
    silent: jsonOnly,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
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
