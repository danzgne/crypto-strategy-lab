import '@crypto-strategy-lab/strategy-engine/strategies';

import type { Candle } from '@crypto-strategy-lab/shared';
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
import { getTestDatabaseUrl } from '../../../helpers/testDatabaseUrl';

describe('backtest persistence', () => {
  let prisma: AppPrismaClient;
  let ownerId: string;
  const experimentIds: string[] = [];
  const snapshotIds: string[] = [];
  const strategyDefinitionIds: string[] = [];
  const strategyVersionIds: string[] = [];

  beforeAll(async () => {
    prisma = createPrismaClient(getTestDatabaseUrl());
    await prisma.$connect();
    const user = await prisma.user.create({
      data: {
        email: `issue37-${Date.now()}@example.com`,
        passwordHash: 'integration-test',
      },
    });
    ownerId = user.id;
  });

  afterAll(async () => {
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
    if (strategyVersionIds.length > 0) {
      await prisma.strategyVersion.deleteMany({
        where: { id: { in: strategyVersionIds } },
      });
    }
    if (strategyDefinitionIds.length > 0) {
      await prisma.strategyDefinition.deleteMany({
        where: { id: { in: strategyDefinitionIds } },
      });
    }
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it('atomically reuses a private target version while preserving exact input decimals per Experiment', async () => {
    const repository = new PrismaBacktestRepository(prisma);
    const provider: BacktestHistoryProvider = {
      prepareHistoricalCandles: vi.fn().mockResolvedValue({
        candles,
        selectedCandles: candles,
        warmupCandleCount: 0,
      }),
    };
    const service = new BacktestService({
      historyProvider: provider,
      repository,
    });
    const request = {
      endTime: 180_000,
      initialInvestment: '100.123456789012345678',
      pair: 'BTCUSDT',
      params: { fast: 2, slow: 3 },
      slippage: '5',
      startTime: 0,
      strategyId: 'ma',
      timeframe: '1m' as const,
      transactionCost: '0.000800000000000001',
    };

    const first = await service.submit(ownerId, request);
    const second = await service.submit(ownerId, request);
    await service.stop();
    experimentIds.push(first.experimentId, second.experimentId);

    expect(second.experimentId).not.toBe(first.experimentId);
    expect(second.jobId).not.toBe(first.jobId);

    const persistedFirst = await prisma.experiment.findUniqueOrThrow({
      where: { id: first.experimentId },
    });
    const persistedSecond = await prisma.experiment.findUniqueOrThrow({
      where: { id: second.experimentId },
    });
    expect(persistedSecond.strategyVersionId).toBe(
      persistedFirst.strategyVersionId,
    );

    const version = await prisma.strategyVersion.findUniqueOrThrow({
      include: { strategyDefinition: true },
      where: { id: persistedFirst.strategyVersionId },
    });
    strategyVersionIds.push(version.id);
    strategyDefinitionIds.push(version.strategyDefinitionId);
    expect(version.strategyDefinition.recordKind).toBe('BACKTEST_TARGET');
    expect(version.strategyDefinition.source).toBe('MANUAL');

    const experiments = await prisma.experiment.findMany({
      orderBy: { createdAt: 'asc' },
      where: { id: { in: experimentIds } },
    });
    expect(experiments).toHaveLength(2);
    for (const experiment of experiments) {
      snapshotIds.push(experiment.datasetSnapshotId!);
      expect(String(experiment.initialInvestment)).toBe(
        '100.123456789012345678',
      );
      expect(String(experiment.transactionCost)).toBe('0.000800000000000001');
      expect(String(experiment.slippage)).toBe('5');
      expect(experiment.strategyVersionId).toBe(
        persistedFirst.strategyVersionId,
      );
    }
    expect(new Set(snapshotIds).size).toBe(1);

    for (const experiment of experiments) {
      expect(experiment.strategyImplementationVersion).toBe('ma-v1');
      expect(experiment.simulationRulesVersion).toBe('historical-v1');
      expect(experiment.evaluatorVersion).toBe('default-v1');
      expect(experiment.buildRevision).not.toBeNull();
      expect(experiment.generatorAlgorithm).toBeNull();
      expect(experiment.generatorVersion).toBeNull();
      expect(experiment.generatorSeed).toBeNull();
      expect(experiment.generationOrdinal).toBeNull();
    }

    const resource = await service.get(ownerId, first.experimentId);
    expect(resource).toMatchObject({
      initialInvestment: '100.123456789012345678',
      provenance: {
        buildRevision: expect.any(String),
        evaluatorVersion: 'default-v1',
        generator: null,
        reproducible: true,
        simulationRulesVersion: 'historical-v1',
        strategyImplementationVersion: 'ma-v1',
      },
      slippage: '5',
      transactionCost: '0.000800000000000001',
    });

    const history = await repository.findHistory(ownerId);
    expect(history).toHaveLength(2);
    expect(history.map((item) => item.experimentId)).toEqual(
      expect.arrayContaining(experimentIds),
    );
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pair: 'BTCUSDT',
          status: expect.stringMatching(/^(queued|running|completed)$/),
          strategyId: 'ma',
          strategyName: 'ma backtest target',
          timeframe: '1m',
        }),
      ]),
    );
  });
});

const candles: Candle[] = [
  makeCandle(0),
  makeCandle(60_000),
  makeCandle(120_000),
];

function makeCandle(openTime: number): Candle {
  return {
    close: 100,
    closeTime: openTime + 59_999,
    high: 101,
    isClosed: true,
    low: 99,
    open: 100,
    openTime,
    pair: 'BTCUSDT',
    timeframe: '1m',
    volume: 10,
  };
}
