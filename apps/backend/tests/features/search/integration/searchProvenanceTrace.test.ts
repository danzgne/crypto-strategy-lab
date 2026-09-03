import '@crypto-strategy-lab/strategy-engine/strategies';

import type {
  CandidateStrategy,
  Candle,
  StrategyGenerator,
} from '@crypto-strategy-lab/shared';
import { createDomainEvent } from '@crypto-strategy-lab/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  createPrismaClient,
  type AppPrismaClient,
} from '@/database/prismaClient';
import {
  BacktestService,
  PrismaBacktestRepository,
  type BacktestHistoryProvider,
} from '@/api/features/backtests';
import {
  PrismaLeaderboardRepository,
  RankingService,
} from '@/api/features/leaderboard';
import { InMemoryDomainEventBus } from '@/events/inMemoryDomainEventBus';
import { SearchCoordinator } from '@/api/features/search/services/searchCoordinator';
import { getTestDatabaseUrl } from '../../../helpers/testDatabaseUrl';
import { defaultSearchSpace } from '../../../helpers/searchFixtures';

class OneShotGenerator implements StrategyGenerator {
  private called = false;

  public generate(): CandidateStrategy {
    if (this.called) {
      throw new Error('OneShotGenerator only produces a single candidate');
    }
    this.called = true;
    return {
      fingerprint: 'issue90-trace-candidate',
      parameterSnapshots: [{ fast: 2, slow: 3 }],
      provenance: {
        algorithm: 'random-v1',
        generationOrdinal: 1,
        seed: 12_345,
      },
      strategyIds: ['ma'],
    };
  }
}

function makeCandles(pair: string): Candle[] {
  return [
    {
      close: 101,
      closeTime: 59_999,
      high: 102,
      isClosed: true,
      low: 99,
      open: 100,
      openTime: 0,
      pair,
      timeframe: '1h',
      volume: 10,
    },
    {
      close: 103,
      closeTime: 3_599_999,
      high: 104,
      isClosed: true,
      low: 100,
      open: 101,
      openTime: 3_540_000,
      pair,
      timeframe: '1h',
      volume: 10,
    },
  ];
}

async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('waitUntil timed out');
}

describe('provenance trace: SearchRun -> Experiment -> Backtest Job -> Leaderboard Entry -> detail API', () => {
  let prisma: AppPrismaClient;
  let ownerId: string;
  const experimentIds: string[] = [];
  const searchRunIds: string[] = [];
  const datasetSnapshotIds: string[] = [];

  beforeAll(async () => {
    prisma = createPrismaClient(getTestDatabaseUrl());
    await prisma.$connect();
    const user = await prisma.user.create({
      data: {
        email: `issue90-trace-${Date.now()}@example.com`,
        passwordHash: 'integration-test',
      },
    });
    ownerId = user.id;
  });

  afterAll(async () => {
    let strategyVersionIds: string[] = [];
    let strategyDefinitionIds: string[] = [];

    if (experimentIds.length > 0) {
      const experiments = await prisma.experiment.findMany({
        select: { strategyVersion: { select: { strategyDefinitionId: true } } },
        where: { id: { in: experimentIds } },
      });
      strategyDefinitionIds = experiments.map(
        (e) => e.strategyVersion.strategyDefinitionId,
      );
      await prisma.leaderboard.deleteMany({ where: { ownerId } });
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
    if (searchRunIds.length > 0) {
      await prisma.searchRun.deleteMany({
        where: { id: { in: searchRunIds } },
      });
    }
    if (strategyDefinitionIds.length > 0) {
      strategyVersionIds = (
        await prisma.strategyVersion.findMany({
          select: { id: true },
          where: { strategyDefinitionId: { in: strategyDefinitionIds } },
        })
      ).map((v) => v.id);
      await prisma.strategyVersion.deleteMany({
        where: { id: { in: strategyVersionIds } },
      });
      await prisma.strategyDefinition.deleteMany({
        where: { id: { in: strategyDefinitionIds } },
      });
    }
    if (datasetSnapshotIds.length > 0) {
      await prisma.datasetSnapshot.deleteMany({
        where: { id: { in: datasetSnapshotIds } },
      });
    }
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it('carries one generated candidate all the way to a rendered, fully typed provenance response', async () => {
    const pair = 'ISSUE90USDT';
    const candles = makeCandles(pair);
    const historyProvider: BacktestHistoryProvider = {
      prepareHistoricalCandles: vi.fn(async () => ({
        candles,
        selectedCandles: candles,
        warmupCandleCount: 0,
      })),
    };
    const eventBus = new InMemoryDomainEventBus();
    const coordinator = new SearchCoordinator({
      eventBus,
      historyProvider,
      prisma,
    });
    await coordinator.start();

    const rankingService = new RankingService({
      eventBus,
      repository: new PrismaLeaderboardRepository(prisma, 10),
      topK: 10,
    });
    await rankingService.start();

    const runId = await coordinator.startRun({
      generator: new OneShotGenerator(),
      ownerId,
      searchSpace: { ...defaultSearchSpace, pair },
      stopPolicy: { maxCandidates: 1, maxInFlight: 10 },
    });
    searchRunIds.push(runId);

    await waitUntil(
      () => (coordinator.getRun(runId)?.acceptedCandidates ?? 0) >= 1,
    );

    // 1. Experiment carries complete provenance as soon as it is created.
    const experiment = await prisma.experiment.findFirstOrThrow({
      where: { ownerId, searchRunId: runId },
    });
    experimentIds.push(experiment.id);
    if (experiment.datasetSnapshotId) {
      datasetSnapshotIds.push(experiment.datasetSnapshotId);
    }
    expect(experiment.strategyImplementationVersion).toBe('ma-v1');
    expect(experiment.simulationRulesVersion).toBe('historical-v1');
    expect(experiment.evaluatorVersion).toBe('default-v1');
    expect(experiment.buildRevision).not.toBeNull();
    expect(experiment.generatorAlgorithm).toBe('random');
    expect(experiment.generatorVersion).toBe('random-v1');
    expect(experiment.generatorSeed).toBe(12_345);
    expect(experiment.generationOrdinal).toBe(1);

    const job = await prisma.backtestJob.findFirstOrThrow({
      where: { experimentId: experiment.id },
    });

    // 2. Simulate the Backtest Worker completing the job (as PrismaJobRepository.completeJob would).
    await prisma.experiment.update({
      data: {
        losses: 0,
        maxDrawdown: '0.1',
        maxDrawdownAmount: '10',
        profitFactor: '2',
        profitFactorInfinite: false,
        return: '0.2',
        score: '1.5',
        sharpeRatio: '1',
        totalProfit: '200',
        totalTrades: 5,
        winRate: '0.6',
        wins: 3,
      },
      where: { id: experiment.id },
    });
    await prisma.backtestJob.update({
      data: { status: 'COMPLETED' },
      where: { id: job.id },
    });
    await eventBus.publish(
      createDomainEvent('StrategyEvaluated', {
        endTime: Number(experiment.endTime),
        experimentId: experiment.id,
        maxDrawdown: '0.1',
        memberStrategies: [],
        ownerId,
        pair: experiment.pair,
        return: '0.2',
        score: '1.5',
        startTime: Number(experiment.startTime),
        strategyDisplayName: 'MA',
        strategyKind: 'singular',
        strategyVersionId: experiment.strategyVersionId,
        timeframe: experiment.timeframe as '1h',
        totalProfit: '200',
        totalTrades: 5,
        winRate: '0.6',
      }),
    );

    // 3. Leaderboard Entry links back to the exact Experiment.
    await waitUntil(async () => {
      const entry = await prisma.leaderboardEntry.findFirst({
        where: { experimentId: experiment.id },
      });
      return entry !== null;
    });
    const leaderboardEntry = await prisma.leaderboardEntry.findFirstOrThrow({
      where: { experimentId: experiment.id },
    });
    expect(leaderboardEntry.experimentId).toBe(experiment.id);
    expect(leaderboardEntry.strategyVersionId).toBe(
      experiment.strategyVersionId,
    );

    // 4. The detail API returns the complete, typed provenance the frontend renders.
    const backtestService = new BacktestService({
      historyProvider,
      repository: new PrismaBacktestRepository(prisma),
    });
    const detail = await backtestService.get(ownerId, experiment.id);

    expect(detail?.provenance).toEqual({
      buildRevision: experiment.buildRevision,
      datasetSnapshotFingerprint: expect.any(String),
      evaluatorVersion: 'default-v1',
      generator: {
        algorithm: 'random',
        generationOrdinal: 1,
        seed: 12_345,
        version: 'random-v1',
      },
      reproducible: true,
      simulationRulesVersion: 'historical-v1',
      strategyImplementationVersion: 'ma-v1',
      strategyParams: { fast: 2, slow: 3 },
      strategyVersionId: experiment.strategyVersionId,
    });

    rankingService.stop();
    coordinator.stop();
  });
});
