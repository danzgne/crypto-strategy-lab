import type {
  BacktestRepository,
  BacktestSubmissionInput,
  BacktestSubmissionResult,
  StoredBacktestResource,
  StoredStrategyVersion,
} from '../types';
import type { AppPrismaClient } from '../../../../database/prismaClient';
import type { Candle, SimulatedTrade } from '@crypto-strategy-lab/shared';
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
          ? await findOrCreatePrivateVersion(transaction, ownerId, input)
          : await transaction.strategyVersion.findFirst({
              where: {
                id: input.target.strategyVersionId,
                ownerId,
              },
            });
      if (version === null) {
        throw new Error('Backtest target strategy version no longer exists');
      }

      const snapshot = await transaction.datasetSnapshot.upsert({
        where: { fingerprint: input.dataset.fingerprint },
        create: {
          candles: toInputJson(input.dataset.candles),
          endTime: BigInt(input.dataset.endTime),
          fingerprint: input.dataset.fingerprint,
          pair: input.dataset.pair,
          startTime: BigInt(input.dataset.startTime),
          timeframe: input.dataset.timeframe,
          warmupCandleCount: input.dataset.warmupCandleCount,
        },
        update: {},
      });

      const experiment = await transaction.experiment.create({
        data: {
          datasetSnapshotId: snapshot.id,
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

async function findOrCreatePrivateVersion(
  transaction: Prisma.TransactionClient,
  ownerId: string,
  input: BacktestSubmissionInput,
) {
  const canonicalIdentity = `private:${input.target.canonicalIdentity}`;
  const existingPrivate = await transaction.strategyVersion.findFirst({
    include: { strategyDefinition: true },
    where: {
      ownerId,
      canonicalIdentity: {
        in: [canonicalIdentity, input.target.canonicalIdentity],
      },
      strategyDefinition: { isPrivate: true },
    },
  });
  if (existingPrivate !== null) return existingPrivate;

  const definition = await transaction.strategyDefinition.create({
    data: {
      isPrivate: true,
      name: `${input.target.strategyId} backtest target`,
      ownerId,
      type: input.target.strategyId,
    },
  });
  return transaction.strategyVersion.create({
    data: {
      canonicalIdentity,
      ownerId,
      params: toInputJson(input.target.params),
      strategyDefinitionId: definition.id,
    },
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
