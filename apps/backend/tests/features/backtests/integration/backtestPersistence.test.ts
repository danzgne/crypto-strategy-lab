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

describe('backtest persistence', () => {
  let prisma: AppPrismaClient;
  let ownerId: string;
  const experimentIds: string[] = [];
  const snapshotIds: string[] = [];
  const strategyDefinitionIds: string[] = [];
  const strategyVersionIds: string[] = [];

  beforeAll(async () => {
    prisma = createPrismaClient(process.env.DATABASE_URL!);
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
    const provider: BacktestHistoryProvider = {
      prepareHistoricalCandles: vi.fn().mockResolvedValue({
        candles,
        selectedCandles: candles,
        warmupCandleCount: 0,
      }),
    };
    const service = new BacktestService({
      historyProvider: provider,
      repository: new PrismaBacktestRepository(prisma),
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
    expect(version.strategyDefinition.isPrivate).toBe(true);
    expect(version.canonicalIdentity).toMatch(/^private:/);

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

    const resource = await service.get(ownerId, first.experimentId);
    expect(resource).toMatchObject({
      initialInvestment: '100.123456789012345678',
      slippage: '5',
      transactionCost: '0.000800000000000001',
    });
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
