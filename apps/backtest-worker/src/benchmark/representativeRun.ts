import { randomUUID } from 'node:crypto';
import { config as loadEnvironment } from 'dotenv';
import '@crypto-strategy-lab/strategy-engine/strategies';

import { createPrismaClient } from '../database/prismaClient';
import { PrismaJobRepository } from '../repositories/prisma/prismaJobRepository';
import { PostgresJobQueue } from '../queue/PostgresJobQueue';
import { BacktestWorker } from '../worker/BacktestWorker';
import { createAppLogger } from '../utils/logger';
import { generateWorkerId } from '../config/workerConfig';
import { formatHumanReport, type BenchmarkMetrics } from './benchmarkReport';
import {
  cleanupBenchmarkCampaign,
  gatherBenchmarkMetrics,
  waitForBenchmarkCompletion,
} from './benchmarkHelpers';

loadEnvironment({
  path: new URL('../../../../.env', import.meta.url),
  quiet: true,
});

export interface RepresentativeRunOptions {
  jobs?: number;
  silent?: boolean;
}

export async function executeRepresentativeRun(
  options: RepresentativeRunOptions = {},
): Promise<BenchmarkMetrics> {
  const totalJobs = Math.max(4, options.jobs ?? 50);
  const silent = options.silent ?? false;

  const databaseUrl =
    process.env.DATABASE_URL ||
    'postgresql://crypto_lab:crypto_lab@localhost:5434/crypto_strategy_lab?schema=public';
  const prisma = createPrismaClient(databaseUrl);
  const logger = createAppLogger({
    service: 'representative-run',
    enabled: false,
  });

  const runId = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      email: `rep-${runId}-${Date.now()}@example.com`,
      passwordHash: 'representative',
      role: 'USER',
    },
  });
  const ownerId = user.id;

  // 1. Create MA strategy definition & version
  const maDef = await prisma.strategyDefinition.create({
    data: {
      name: `Representative MA ${runId}`,
      ownerId,
      source: 'USER_PROMPT',
      sourceInput: 'Moving Average Crossover',
      type: 'ma',
    },
  });
  const maVer = await prisma.strategyVersion.create({
    data: {
      libraryVersion: '1.0.0',
      ownerId,
      params: { fast: 5, slow: 15 },
      strategyDefinitionId: maDef.id,
      versionTag: `ma-v1-${runId}`,
    },
  });

  // 2. Create RSI strategy definition & version
  const rsiDef = await prisma.strategyDefinition.create({
    data: {
      name: `Representative RSI ${runId}`,
      ownerId,
      source: 'USER_PROMPT',
      sourceInput: 'RSI Momentum',
      type: 'rsi',
    },
  });
  const rsiVer = await prisma.strategyVersion.create({
    data: {
      libraryVersion: '1.0.0',
      ownerId,
      params: { period: 14, overbought: 70, oversold: 30 },
      strategyDefinitionId: rsiDef.id,
      versionTag: `rsi-v1-${runId}`,
    },
  });

  // 3. Create Bollinger Bands definition & version
  const bbDef = await prisma.strategyDefinition.create({
    data: {
      name: `Representative Bollinger ${runId}`,
      ownerId,
      source: 'USER_PROMPT',
      sourceInput: 'Bollinger Bands Volatility',
      type: 'bollinger',
    },
  });
  const bbVer = await prisma.strategyVersion.create({
    data: {
      libraryVersion: '1.0.0',
      ownerId,
      params: { period: 20, stdDev: 2 },
      strategyDefinitionId: bbDef.id,
      versionTag: `bb-v1-${runId}`,
    },
  });

  // 4. Create Composite Strategy definition & version (combining MA + RSI)
  const compDef = await prisma.strategyDefinition.create({
    data: {
      name: `Representative Composite ${runId}`,
      ownerId,
      source: 'USER_PROMPT',
      sourceInput: 'Composite MA + RSI',
      type: 'composite',
    },
  });
  const compVer = await prisma.strategyVersion.create({
    data: {
      libraryVersion: '1.0.0',
      ownerId,
      params: {
        mode: 'majority',
        members: [
          { strategyId: 'ma', params: { fast: 5, slow: 15 } },
          {
            strategyId: 'rsi',
            params: { period: 14, overbought: 70, oversold: 30 },
          },
        ],
      },
      strategyDefinitionId: compDef.id,
      versionTag: `comp-v1-${runId}`,
    },
  });

  const versions = [maVer.id, rsiVer.id, bbVer.id, compVer.id];

  // 5. Generate 100 realistic candle data points
  let currentPrice = 50_000;
  const candleCount = 100;
  const candleData = Array.from({ length: candleCount }, (_, index) => {
    const change = (Math.sin(index / 5) + Math.cos(index / 3)) * 100;
    const open = currentPrice;
    const close = Math.round(open + change);
    const high = Math.max(open, close) + 25;
    const low = Math.min(open, close) - 25;
    currentPrice = close;
    const openTime = index * 60_000;
    const closeTime = openTime + 59_999;
    return {
      close,
      closeTime,
      high,
      isClosed: true,
      low,
      open,
      openTime,
      pair: 'BTCUSDT',
      timeframe: '1m',
      volume: 15 + Math.round(Math.abs(change)),
    };
  });

  const snapshot = await prisma.datasetSnapshot.create({
    data: {
      candles: candleData,
      endTime: candleCount * 60_000,
      fingerprint: `rep-snapshot-${runId}`,
      pair: 'BTCUSDT',
      startTime: 0,
      timeframe: '1m',
      warmupCandleCount: 0,
    },
  });

  if (!silent) {
    process.stdout.write(
      `Creating representative campaign with real strategies against ${candleCount} candles...\n`,
    );
  }

  // Create experiments and jobs round-robin across strategies
  for (let i = 0; i < totalJobs; i++) {
    const versionId = versions[i % versions.length]!;
    const exp = await prisma.experiment.create({
      data: {
        datasetSnapshotId: snapshot.id,
        endTime: candleCount * 60_000,
        initialInvestment: 10_000,
        ownerId,
        pair: 'BTCUSDT',
        slippage: 5,
        startTime: 0,
        strategyVersionId: versionId,
        timeframe: '1m',
        transactionCost: 0.001,
      },
    });

    await prisma.backtestJob.create({
      data: {
        experimentId: exp.id,
        ownerId,
        status: 'PENDING',
      },
    });
  }

  // Start 2 in-process workers
  const workerIds = [generateWorkerId(), generateWorkerId()];
  const workers: BacktestWorker[] = [];

  for (const wId of workerIds) {
    const queue = new PostgresJobQueue(new PrismaJobRepository(prisma));
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

  let completionResult = { peakConnections: 1, wallTimeSeconds: 0 };
  try {
    completionResult = await waitForBenchmarkCompletion(prisma, {
      ownerId,
      pollIntervalMs: 200,
      silent,
      totalJobs,
    });
  } finally {
    for (const worker of workers) {
      await worker.stop();
    }
  }

  const metrics = await gatherBenchmarkMetrics(prisma, {
    datasetCandleCount: candleCount,
    ownerId,
    peakConnections: completionResult.peakConnections,
    totalJobs,
    wallTimeSeconds: completionResult.wallTimeSeconds,
    workerCount: 2,
  });

  if (!silent) {
    process.stdout.write(formatHumanReport(metrics) + '\n');
  }

  // Cleanup
  await cleanupBenchmarkCampaign(prisma, {
    definitionIds: [maDef.id, rsiDef.id, bbDef.id, compDef.id],
    ownerId,
    silent,
    snapshotId: snapshot.id,
    versionIds: versions,
  });
  await prisma.$disconnect();

  return metrics;
}

if (process.argv[1]?.endsWith('representativeRun.ts')) {
  executeRepresentativeRun()
    .then(() => process.exit(0))
    .catch((err) => {
      process.stderr.write(`Representative run failed: ${String(err)}\n`);
      process.exit(1);
    });
}
