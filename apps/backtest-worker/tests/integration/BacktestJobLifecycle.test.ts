import type { SimulatedTrade } from '@crypto-strategy-lab/shared/backtest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createPrismaClient,
  type WorkerPrismaClient,
} from '../../src/database/prismaClient';
import { PostgresJobQueue } from '../../src/queue/PostgresJobQueue';
import { PrismaJobRepository } from '../../src/repositories/prisma/prismaJobRepository';
import { createAppLogger } from '../../src/utils/logger';
import { BacktestWorker } from '../../src/worker/BacktestWorker';
import { getTestDatabaseUrl } from '../helpers/testDatabaseUrl';
import type { PersistedBacktestOutcome } from '../../src/worker/types';

describe('backtest job lifecycle integration', () => {
  let prisma: WorkerPrismaClient;
  let ownerId: string;
  let strategyDefinitionId: string;
  let strategyVersionId: string;
  const experimentIds: string[] = [];
  const snapshotIds: string[] = [];

  beforeAll(async () => {
    prisma = createPrismaClient(getTestDatabaseUrl());
    await prisma.$connect();
    await prisma.backtestJob.deleteMany({
      where: { status: { in: ['PENDING', 'CLAIMED'] } },
    });

    const user = await prisma.user.create({
      data: {
        email: `issue37-worker-${Date.now()}@example.com`,
        passwordHash: 'integration-test',
      },
    });
    ownerId = user.id;

    const definition = await prisma.strategyDefinition.create({
      data: {
        name: 'Issue 37 worker fixture',
        ownerId,
        source: 'USER_PROMPT',
        sourceInput: 'Issue 37 worker fixture',
        tags: [],
        type: 'ma',
      },
    });
    strategyDefinitionId = definition.id;

    const version = await prisma.strategyVersion.create({
      data: {
        libraryVersion: '1.0.0',
        ownerId,
        params: { fast: 2, slow: 3 },
        strategyDefinitionId,
        versionTag: 'issue37-worker-fixture',
      },
    });
    strategyVersionId = version.id;
  });

  afterAll(async () => {
    const events = await prisma.outboxEvent.findMany({
      where: {
        name: {
          in: ['BacktestStarted', 'BacktestCompleted', 'StrategyEvaluated'],
        },
      },
    });
    const eventIds = events
      .filter((event) => {
        const payload = event.payload as { experimentId?: unknown };
        return (
          typeof payload.experimentId === 'string' &&
          experimentIds.includes(payload.experimentId)
        );
      })
      .map((event) => event.id);
    if (eventIds.length > 0) {
      await prisma.outboxEvent.deleteMany({ where: { id: { in: eventIds } } });
    }
    if (experimentIds.length > 0) {
      await prisma.backtestJob.deleteMany({
        where: { experimentId: { in: experimentIds } },
      });
      await prisma.trade.deleteMany({
        where: { experimentId: { in: experimentIds } },
      });
      await prisma.experiment.deleteMany({
        where: { id: { in: experimentIds } },
      });
    }
    if (snapshotIds.length > 0) {
      await prisma.datasetSnapshot.deleteMany({
        where: { id: { in: snapshotIds } },
      });
    }
    await prisma.leaderboard.deleteMany({ where: { ownerId } });
    await prisma.strategyVersion.delete({ where: { id: strategyVersionId } });
    await prisma.strategyDefinition.delete({
      where: { id: strategyDefinitionId },
    });
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it('fences stale completion and persists outcomes with lifecycle outbox events', async () => {
    const queue = new PostgresJobQueue(new PrismaJobRepository(prisma));
    const outcome = createOutcome();
    const first = await createExperiment('lifecycle');
    const firstJobId = await queue.enqueue(first.id, ownerId);
    const claimed = await queue.claim('worker-1');

    expect(claimed).not.toBeNull();
    await queue.start(claimed!);
    expect(await queue.renew(claimed!)).toBe(true);
    const executionInput = await queue.loadInput(claimed!);
    expect(executionInput).toMatchObject({
      experimentId: first.id,
      initialInvestment: 100,
      strategyId: 'ma',
      strategyVersionId,
    });

    expect(await queue.completeClaim(claimed!, outcome)).toBe(true);

    const completedJob = await prisma.backtestJob.findUniqueOrThrow({
      where: { id: firstJobId },
    });
    const completedExperiment = await prisma.experiment.findUniqueOrThrow({
      where: { id: first.id },
    });
    const persistedTrades = await prisma.trade.findMany({
      where: { experimentId: first.id },
    });
    expect(completedJob.status).toBe('COMPLETED');
    expect(completedExperiment.totalTrades).toBe(1);
    expect(completedExperiment.totalProfit?.toString()).toBe('5');
    expect(persistedTrades).toHaveLength(1);
    expect(persistedTrades[0]?.exitReason).toBe('FINAL_CANDLE');

    const lifecycleEvents = await prisma.outboxEvent.findMany({
      where: {
        name: {
          in: ['BacktestStarted', 'BacktestCompleted', 'StrategyEvaluated'],
        },
      },
    });
    const experimentEvents = lifecycleEvents.filter((event) => {
      const payload = event.payload as { experimentId?: unknown };
      return payload.experimentId === first.id;
    });
    expect(experimentEvents.map((event) => event.name)).toEqual(
      expect.arrayContaining([
        'BacktestStarted',
        'BacktestCompleted',
        'StrategyEvaluated',
      ]),
    );
    const evaluated = experimentEvents.find(
      (event) => event.name === 'StrategyEvaluated',
    );
    expect(evaluated?.payload).toMatchObject({
      experimentId: first.id,
      ownerId,
      score: '0.4',
      strategyKind: 'singular',
      strategyVersionId,
    });

    const second = await createExperiment('fencing');
    const secondJobId = await queue.enqueue(second.id, ownerId);
    const staleClaim = await queue.claim('worker-stale');
    expect(staleClaim?.id).toBe(secondJobId);
    await prisma.backtestJob.update({
      data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
      where: { id: secondJobId },
    });

    const reclaimed = await queue.claim('worker-current');
    expect(reclaimed?.id).toBe(secondJobId);
    expect(await queue.completeClaim(staleClaim!, outcome)).toBe(false);

    const fencedJob = await prisma.backtestJob.findUniqueOrThrow({
      where: { id: secondJobId },
    });
    const fencedExperiment = await prisma.experiment.findUniqueOrThrow({
      where: { id: second.id },
    });
    expect(fencedJob.workerId).toBe('worker-current');
    expect(fencedJob.status).toBe('CLAIMED');
    expect(fencedExperiment.totalTrades).toBeNull();
    expect(
      await prisma.trade.count({ where: { experimentId: second.id } }),
    ).toBe(0);
  });

  it('refuses to execute an Experiment recording an unavailable Strategy implementation version', async () => {
    const queue = new PostgresJobQueue(new PrismaJobRepository(prisma));
    const experiment = await createExperiment('unsupported-version', {
      strategyImplementationVersion: 'ma-v99',
    });
    const jobId = await queue.enqueue(experiment.id, ownerId);

    const worker = new BacktestWorker(
      'worker-unsupported-version',
      queue,
      createAppLogger({ enabled: false, service: 'worker-test' }),
      { pollIntervalMs: 20 },
    );
    worker.start();

    const deadline = Date.now() + 2_000;
    let job = await prisma.backtestJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    while (job.status !== 'FAILED' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      job = await prisma.backtestJob.findUniqueOrThrow({
        where: { id: jobId },
      });
    }
    await worker.stop();

    expect(job.status).toBe('FAILED');
    expect(job.failureCategory).toBe('PERMANENT');
    expect(job.error).toContain('UNSUPPORTED_VERSION');
    expect(job.error).toContain('ma-v99');

    const untouchedExperiment = await prisma.experiment.findUniqueOrThrow({
      where: { id: experiment.id },
    });
    expect(untouchedExperiment.totalTrades).toBeNull();
  });

  async function createExperiment(
    suffix: string,
    overrides: {
      strategyImplementationVersion?: string;
      buildRevision?: string;
    } = {},
  ) {
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
        fingerprint: `issue37-worker-${suffix}-${Date.now()}-${Math.random()}`,
        pair: 'BTCUSDT',
        startTime: 0,
        timeframe: '1m',
        warmupCandleCount: 0,
      },
    });
    snapshotIds.push(snapshot.id);
    const experiment = await prisma.experiment.create({
      data: {
        buildRevision: overrides.buildRevision ?? null,
        datasetSnapshotId: snapshot.id,
        endTime: 60_000,
        initialInvestment: 100,
        ownerId,
        pair: 'BTCUSDT',
        slippage: 0,
        startTime: 0,
        strategyImplementationVersion:
          overrides.strategyImplementationVersion ?? null,
        strategyVersionId,
        timeframe: '1m',
        transactionCost: 0,
      },
    });
    experimentIds.push(experiment.id);
    return experiment;
  }
});

function createOutcome(): PersistedBacktestOutcome {
  const trade: SimulatedTrade = {
    direction: 'LONG',
    entryPrice: 100,
    entryTime: 0,
    exitPrice: 105,
    exitReason: 'FINAL_CANDLE',
    exitTime: 59_999,
    investment: 100,
    pair: 'BTCUSDT',
    profit: 5,
    slippage: 0,
    stopLoss: null,
    takeProfit: null,
    transactionCost: 0,
  };
  return {
    metrics: {
      losses: 0,
      maxDrawdown: 0,
      maxDrawdownAmount: 0,
      profitFactor: Infinity,
      profitFactorInfinite: true,
      return: 0.05,
      score: 0.4,
      sharpeRatio: 0,
      totalProfit: 5,
      totalTrades: 1,
      winRate: 1,
      wins: 1,
    },
    trades: [trade],
  };
}
