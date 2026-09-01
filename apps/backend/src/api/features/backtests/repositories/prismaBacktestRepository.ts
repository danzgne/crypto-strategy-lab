import type {
  BacktestRepository,
  BacktestSubmissionInput,
  BacktestSubmissionResult,
  PendingBacktestSubmission,
  PreparedDataset,
  StoredBacktestHistoryItem,
  StoredBacktestResource,
  StoredStrategyVersion,
} from '../types';
import type { AppPrismaClient } from '../../../../database/prismaClient';
import type { Candle, SimulatedTrade } from '@crypto-strategy-lab/shared';
import { computeStrategyVersionTag } from '@crypto-strategy-lab/shared/strategy-version';
import { Prisma } from '../../../../../../../generated/prisma/client';

export class PrismaBacktestRepository implements BacktestRepository {
  public constructor(private readonly prisma: AppPrismaClient) {}

  public async findStrategyVersion(
    ownerId: string,
    versionId: string,
  ): Promise<StoredStrategyVersion | null> {
    const version = await this.prisma.strategyVersion.findFirst({
      include: { strategyDefinition: true },
      where: { id: versionId, ownerId },
    });
    if (version === null) return null;
    return {
      canonicalIdentity: version.canonicalIdentity,
      id: version.id,
      params: version.params,
      strategyId: version.strategyDefinition.type,
    };
  }

  public async createSubmission(
    ownerId: string,
    input: BacktestSubmissionInput,
  ): Promise<BacktestSubmissionResult> {
    return this.prisma.$transaction(async (transaction) => {
      const version =
        input.target.strategyVersionId === undefined
          ? await findOrCreateBacktestTarget(transaction, ownerId, input)
          : await transaction.strategyVersion.findFirst({
              where: {
                id: input.target.strategyVersionId,
                ownerId,
              },
            });
      if (version === null) {
        throw new Error('Backtest target strategy version no longer exists');
      }

      const experiment = await transaction.experiment.create({
        data: {
          endTime: BigInt(input.endTime),
          evaluatorVersion: 'default-v1',
          initialInvestment: input.initialInvestment,
          ownerId,
          pair: input.pair,
          simulationRulesVersion: 'historical-v1',
          slippage: input.slippage,
          startTime: BigInt(input.startTime),
          strategyVersionId: version.id,
          timeframe: input.timeframe,
          transactionCost: input.transactionCost,
        },
      });
      const job = await transaction.backtestJob.create({
        data: {
          experimentId: experiment.id,
          ownerId,
          status: 'PENDING',
        },
      });

      return {
        experimentId: experiment.id,
        jobId: job.id,
        strategyVersionId: version.id,
      };
    });
  }

  public async attachDataset(
    ownerId: string,
    experimentId: string,
    dataset: PreparedDataset,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const pending = await transaction.experiment.updateMany({
        data: { updatedAt: new Date() },
        where: { datasetSnapshotId: null, id: experimentId, ownerId },
      });
      if (pending.count !== 1) return false;
      const job = await transaction.backtestJob.findFirst({
        select: { status: true },
        where: { experimentId, ownerId },
      });
      if (job === null || job.status !== 'PENDING') return false;

      const snapshot = await transaction.datasetSnapshot.upsert({
        where: { fingerprint: dataset.fingerprint },
        create: {
          candles: toInputJson(dataset.candles),
          endTime: BigInt(dataset.endTime),
          fingerprint: dataset.fingerprint,
          pair: dataset.pair,
          startTime: BigInt(dataset.startTime),
          timeframe: dataset.timeframe,
          warmupCandleCount: dataset.warmupCandleCount,
        },
        update: {},
      });
      const updated = await transaction.experiment.updateMany({
        data: { datasetSnapshotId: snapshot.id },
        where: {
          datasetSnapshotId: null,
          id: experimentId,
          ownerId,
        },
      });
      return updated.count === 1;
    });
  }

  public async failPreparation(
    ownerId: string,
    experimentId: string,
    reason: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const pending = await transaction.experiment.updateMany({
        data: { updatedAt: new Date() },
        where: { datasetSnapshotId: null, id: experimentId, ownerId },
      });
      if (pending.count !== 1) return false;

      const updated = await transaction.backtestJob.updateMany({
        data: {
          error: reason,
          status: 'FAILED',
          updatedAt: new Date(),
        },
        where: {
          experimentId,
          ownerId,
          status: 'PENDING',
        },
      });
      return updated.count === 1;
    });
  }

  public async findPendingSubmissions(): Promise<PendingBacktestSubmission[]> {
    const experiments = await this.prisma.experiment.findMany({
      include: {
        backtestJob: true,
        strategyVersion: { include: { strategyDefinition: true } },
      },
      orderBy: { createdAt: 'asc' },
      where: { datasetSnapshotId: null },
    });

    return experiments.flatMap((experiment) => {
      const job = experiment.backtestJob;
      if (job === null || job.status !== 'PENDING') return [];
      return [
        {
          endTime: Number(experiment.endTime),
          experimentId: experiment.id,
          ownerId: experiment.ownerId,
          pair: experiment.pair,
          startTime: Number(experiment.startTime),
          strategyVersion: {
            canonicalIdentity: experiment.strategyVersion.canonicalIdentity,
            id: experiment.strategyVersion.id,
            params: experiment.strategyVersion.params,
            strategyId: experiment.strategyVersion.strategyDefinition.type,
          },
          timeframe:
            experiment.timeframe as PendingBacktestSubmission['timeframe'],
        },
      ];
    });
  }

  public async findResource(
    ownerId: string,
    experimentId: string,
  ): Promise<StoredBacktestResource | null> {
    const experiment = await this.prisma.experiment.findFirst({
      include: {
        backtestJob: true,
        datasetSnapshot: true,
        strategyVersion: { include: { strategyDefinition: true } },
        trades: { orderBy: { entryTime: 'asc' } },
      },
      where: { id: experimentId, ownerId },
    });
    if (experiment === null || experiment.backtestJob === null) return null;

    const snapshotCandles = parseSnapshotCandles(
      experiment.datasetSnapshot?.candles,
    );
    const selectedCandles = snapshotCandles.filter(
      (candle) =>
        candle.openTime >= Number(experiment.startTime) &&
        candle.openTime < Number(experiment.endTime),
    );
    const status = mapStatus(experiment.backtestJob.status);
    const completed = status === 'completed';
    return {
      candles: completed ? selectedCandles : [],
      datasetFingerprint: experiment.datasetSnapshot?.fingerprint ?? null,
      endTime: Number(experiment.endTime),
      evaluatorVersion: experiment.evaluatorVersion,
      experimentId: experiment.id,
      failureReason: experiment.backtestJob.error,
      initialInvestment: toDecimalString(experiment.initialInvestment),
      jobId: experiment.backtestJob.id,
      metrics: completed ? toMetrics(experiment) : null,
      pair: experiment.pair,
      simulationRulesVersion: experiment.simulationRulesVersion,
      slippage: toDecimalString(experiment.slippage),
      startTime: Number(experiment.startTime),
      status,
      strategyId: experiment.strategyVersion.strategyDefinition.type,
      strategyParams: experiment.strategyVersion.params,
      strategyVersionId: experiment.strategyVersionId,
      timeframe: experiment.timeframe as StoredBacktestResource['timeframe'],
      transactionCost: toDecimalString(experiment.transactionCost),
      trades: completed
        ? experiment.trades.map((trade) => ({
            direction: trade.direction as 'LONG' | 'SHORT',
            entryPrice: toDecimalString(trade.entryPrice),
            entryTime: Number(trade.entryTime),
            exitPrice: toDecimalString(trade.exitPrice),
            exitReason: (trade.exitReason ??
              'SIGNAL') as SimulatedTrade['exitReason'],
            exitTime: Number(trade.exitTime),
            id: trade.id,
            investment: toDecimalString(trade.investment),
            pair: trade.pair,
            profit: toDecimalString(trade.profit),
            slippage: toDecimalString(trade.slippage),
            stopLoss:
              trade.stopLoss === null ? null : toDecimalString(trade.stopLoss),
            takeProfit:
              trade.takeProfit === null
                ? null
                : toDecimalString(trade.takeProfit),
            transactionCost: toDecimalString(trade.transactionCost),
          }))
        : [],
    };
  }

  public async findHistory(
    ownerId: string,
  ): Promise<StoredBacktestHistoryItem[]> {
    const experiments = await this.prisma.experiment.findMany({
      include: {
        backtestJob: true,
        strategyVersion: { include: { strategyDefinition: true } },
      },
      orderBy: { createdAt: 'desc' },
      where: { ownerId },
    });

    return experiments
      .filter((experiment) => experiment.backtestJob !== null)
      .map((experiment) => {
        const job = experiment.backtestJob!;
        const status = mapStatus(job.status);
        return {
          createdAt: experiment.createdAt.getTime(),
          endTime: Number(experiment.endTime),
          experimentId: experiment.id,
          failureReason: job.error,
          jobId: job.id,
          metrics: status === 'completed' ? toHistoryMetrics(experiment) : null,
          pair: experiment.pair,
          startTime: Number(experiment.startTime),
          status,
          strategyId: experiment.strategyVersion.strategyDefinition.type,
          strategyName: experiment.strategyVersion.strategyDefinition.name,
          strategyVersionId: experiment.strategyVersionId,
          timeframe:
            experiment.timeframe as StoredBacktestHistoryItem['timeframe'],
        };
      });
  }
}

function toHistoryMetrics(
  experiment: Awaited<ReturnType<AppPrismaClient['experiment']['findFirst']>>,
) {
  if (experiment === null) return null;
  return {
    return: toDecimalString(experiment.return),
    totalProfit: toDecimalString(experiment.totalProfit),
    totalTrades: experiment.totalTrades ?? 0,
    winRate: toDecimalString(experiment.winRate),
  };
}

function toMetrics(
  experiment: Awaited<ReturnType<AppPrismaClient['experiment']['findFirst']>>,
) {
  if (experiment === null) return null;
  return {
    return: toDecimalString(experiment.return),
    winRate: toDecimalString(experiment.winRate),
    maxDrawdown: toDecimalString(experiment.maxDrawdown),
    maxDrawdownAmount: toDecimalString(experiment.maxDrawdownAmount),
    totalTrades: experiment.totalTrades ?? 0,
    wins: experiment.wins ?? 0,
    losses: experiment.losses ?? 0,
    totalProfit: toDecimalString(experiment.totalProfit),
    profitFactor: experiment.profitFactorInfinite
      ? '0'
      : toDecimalString(experiment.profitFactor),
    profitFactorInfinite: experiment.profitFactorInfinite,
    sharpeRatio: toDecimalString(experiment.sharpeRatio),
    score: toDecimalString(experiment.score),
  };
}

function mapStatus(status: 'PENDING' | 'CLAIMED' | 'COMPLETED' | 'FAILED') {
  if (status === 'PENDING') return 'queued' as const;
  if (status === 'CLAIMED') return 'running' as const;
  if (status === 'COMPLETED') return 'completed' as const;
  return 'failed' as const;
}

function parseSnapshotCandles(value: unknown): Candle[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isCandle).map((candle) => ({
    close: Number(candle.close),
    closeTime: Number(candle.closeTime),
    high: Number(candle.high),
    isClosed: candle.isClosed,
    low: Number(candle.low),
    open: Number(candle.open),
    openTime: Number(candle.openTime),
    pair: candle.pair,
    timeframe: candle.timeframe as Candle['timeframe'],
    volume: Number(candle.volume),
  }));
}

function isCandle(value: unknown): value is Record<string, unknown> & {
  pair: string;
  timeframe: string;
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
} {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return false;
  const candle = value as Record<string, unknown>;
  return (
    typeof candle.pair === 'string' &&
    typeof candle.timeframe === 'string' &&
    typeof candle.openTime === 'number' &&
    typeof candle.closeTime === 'number' &&
    typeof candle.open === 'number' &&
    typeof candle.high === 'number' &&
    typeof candle.low === 'number' &&
    typeof candle.close === 'number' &&
    typeof candle.volume === 'number' &&
    typeof candle.isClosed === 'boolean'
  );
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return stripUndefined(value) as Prisma.InputJsonValue;
}

async function findOrCreateBacktestTarget(
  transaction: Prisma.TransactionClient,
  ownerId: string,
  input: BacktestSubmissionInput,
) {
  const definition =
    (await transaction.strategyDefinition.findFirst({
      where: {
        ownerId,
        type: input.target.strategyId,
        recordKind: 'BACKTEST_TARGET',
      },
    })) ??
    (await transaction.strategyDefinition.create({
      data: {
        recordKind: 'BACKTEST_TARGET',
        name: `${input.target.strategyId} backtest target`,
        ownerId,
        source: 'MANUAL',
        tags: [],
        type: input.target.strategyId,
      },
    }));

  return transaction.strategyVersion.upsert({
    where: {
      ownerId_strategyDefinitionId_canonicalIdentity: {
        ownerId,
        strategyDefinitionId: definition.id,
        canonicalIdentity: input.target.canonicalIdentity,
      },
    },
    create: {
      canonicalIdentity: input.target.canonicalIdentity,
      libraryVersion: '1.0.0',
      ownerId,
      params: toInputJson(input.target.params),
      strategyDefinitionId: definition.id,
      versionTag: computeStrategyVersionTag(
        input.target.strategyId,
        input.target.params,
      ),
    },
    update: {},
  });
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefined(entry)]),
    );
  }
  return value;
}

function toDecimalString(value: unknown): string {
  if (value === null || value === undefined) return '0';
  return String(value);
}
