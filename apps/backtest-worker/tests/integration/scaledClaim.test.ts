import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import '@crypto-strategy-lab/strategy-engine/strategies';

import {
  createPrismaClient,
  type WorkerPrismaClient,
} from '../../src/database/prismaClient';
import { PrismaJobRepository } from '../../src/repositories/prisma/prismaJobRepository';
import { PostgresJobQueue } from '../../src/queue/PostgresJobQueue';
import { BacktestWorker } from '../../src/worker/BacktestWorker';
import { PrismaServiceHeartbeatRepository } from '../../src/repositories/prisma/prismaServiceHeartbeatRepository';
import { createAppLogger } from '../../src/utils/logger';
import { generateWorkerId } from '../../src/config/workerConfig';
import { cleanupBenchmarkCampaign } from '../../src/benchmark/benchmarkHelpers';

describe('scaled claim and independent worker observation', () => {
  let prisma: WorkerPrismaClient;
  let heartbeatRepo: PrismaServiceHeartbeatRepository;
  let ownerId: string;
  let strategyVersionId: string;
  let strategyDefId: string;
  let snapshotId: string;
  const experimentIds: string[] = [];

  beforeAll(async () => {
    const databaseUrl =
      process.env.DATABASE_URL ||
      'postgresql://crypto_lab:crypto_lab@localhost:5434/crypto_strategy_lab?schema=public';
    prisma = createPrismaClient(databaseUrl);
    heartbeatRepo = new PrismaServiceHeartbeatRepository(prisma);

    const user = await prisma.user.create({
      data: {
        email: `scale-test-${randomUUID()}@example.com`,
        passwordHash: 'scale-test',
        role: 'USER',
      },
    });
    ownerId = user.id;

    const def = await prisma.strategyDefinition.create({
      data: {
        name: 'Scale test strategy',
        ownerId,
        source: 'USER_PROMPT',
        sourceInput: 'Scale test strategy',
        type: 'ma',
      },
    });
    strategyDefId = def.id;

    const ver = await prisma.strategyVersion.create({
      data: {
        libraryVersion: '1.0.0',
        ownerId,
        params: { fast: 2, slow: 5 },
        strategyDefinitionId: def.id,
        versionTag: 'scale-test-v1',
      },
    });
    strategyVersionId = ver.id;

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
        ],
        endTime: 60_000,
        fingerprint: `scale-snapshot-${randomUUID()}`,
        pair: 'BTCUSDT',
        startTime: 0,
        timeframe: '1m',
        warmupCandleCount: 0,
      },
    });
    snapshotId = snapshot.id;
  });

  afterAll(async () => {
    await cleanupBenchmarkCampaign(prisma, {
      definitionIds: [strategyDefId],
      ownerId,
      silent: true,
      snapshotId,
      versionIds: [strategyVersionId],
    });
    await prisma.$disconnect();
  });

  it('executes concurrent scaled claims across 4 workers with zero duplicates and independent heartbeats', async () => {
    const totalJobs = 40;
    const workerCount = 4;
    const workerIds: string[] = [];

    for (let i = 0; i < workerCount; i++) {
      workerIds.push(generateWorkerId());
    }

    // Verify all 4 generated IDs are unique
    const uniqueWorkerIds = new Set(workerIds);
    expect(uniqueWorkerIds.size).toBe(workerCount);

    // Enqueue jobs
    for (let i = 0; i < totalJobs; i++) {
      const exp = await prisma.experiment.create({
        data: {
          datasetSnapshotId: snapshotId,
          endTime: 60_000,
          initialInvestment: 100,
          ownerId,
          pair: 'BTCUSDT',
          slippage: 0,
          startTime: 0,
          strategyVersionId,
          timeframe: '1m',
          transactionCost: 0,
        },
      });
      experimentIds.push(exp.id);

      await prisma.backtestJob.create({
        data: {
          experimentId: exp.id,
          ownerId,
          status: 'PENDING',
        },
      });
    }

    // Start 4 workers and write independent service heartbeats
    const workers: BacktestWorker[] = [];
    const logger = createAppLogger({ service: 'scale-test', enabled: false });

    for (const wId of workerIds) {
      await heartbeatRepo.recordStarted(wId);
      const repo = new PrismaJobRepository(prisma);
      const queue = new PostgresJobQueue(repo);
      const worker = new BacktestWorker(
        wId,
        queue,
        logger,
        undefined,
        undefined,
        {
          pollIntervalMs: 50,
          maxPollIntervalMs: 200,
        },
      );
      worker.start();
      workers.push(worker);
    }

    // Verify independent heartbeats exist for all 4 workers
    const heartbeats = await prisma.serviceHeartbeat.findMany({
      where: {
        service: 'backtest-worker',
        instanceId: { in: workerIds },
      },
    });
    expect(heartbeats).toHaveLength(workerCount);

    // Wait for all 40 jobs to complete
    const startTime = Date.now();
    while (Date.now() - startTime < 30_000) {
      const completedCount = await prisma.backtestJob.count({
        where: {
          experimentId: { in: experimentIds },
          status: 'COMPLETED',
        },
      });
      if (completedCount >= totalJobs) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Stop all workers
    for (const worker of workers) {
      await worker.stop();
    }
    for (const wId of workerIds) {
      await heartbeatRepo.recordStopped(wId);
    }

    // Assertions:
    // 1. All 40 jobs are completed
    const completedJobs = await prisma.backtestJob.findMany({
      where: { experimentId: { in: experimentIds } },
    });
    expect(completedJobs).toHaveLength(totalJobs);
    expect(completedJobs.every((j) => j.status === 'COMPLETED')).toBe(true);

    // 2. No duplicates
    const uniqueExperimentIds = new Set(
      completedJobs.map((j) => j.experimentId),
    );
    expect(uniqueExperimentIds.size).toBe(totalJobs);

    // 3. Independent workers participated in claims
    const participatingWorkers = new Set(
      completedJobs.map((j) => j.workerId).filter(Boolean),
    );
    expect(participatingWorkers.size).toBeGreaterThan(1);
  });
});
