import { randomUUID } from 'node:crypto';

import type {
  AnyDomainEvent,
  Candle,
  Job,
  Timeframe,
} from '@crypto-strategy-lab/shared';
import {
  createDomainEvent,
  formatStrategyDisplay,
} from '@crypto-strategy-lab/shared';
import { Prisma } from '../../../../../generated/prisma/client';

import type { WorkerPrismaClient } from '../../database/prismaClient';
import type { JobRepository } from '../interfaces/jobRepository.interface';
import type {
  BacktestExecutionInput,
  ClaimedBacktestJob,
  PersistedBacktestOutcome,
} from '../../worker/types';
import { JobLeaseLostError } from '../../errors/JobLeaseLostError';

const DEFAULT_LEASE_DURATION_MS = 5 * 60 * 1000;
const MAX_RETRIES = 4;

export class PrismaJobRepository implements JobRepository {
  public constructor(
    private readonly prisma: WorkerPrismaClient,
    private readonly leaseDurationMs = DEFAULT_LEASE_DURATION_MS,
  ) {}

  public async createJob(
    experimentId: string,
    ownerId: string,
  ): Promise<string> {
    const job = await this.prisma.backtestJob.create({
      data: {
        experimentId,
        ownerId,
        status: 'PENDING',
      },
    });
    return job.id;
  }

  public async claimNextJob(workerId: string): Promise<Job | null> {
    const leaseToken = randomUUID();
    const jobs = await this.prisma.$queryRaw<RawClaimedJob[]>`
      UPDATE backtest_jobs
      SET status = 'CLAIMED',
          "claimedAt" = NOW(),
          "workerId" = ${workerId},
          "leaseToken" = ${leaseToken},
          "leaseExpiresAt" = NOW() + (${this.leaseDurationMs} * INTERVAL '1 millisecond'),
          "updatedAt" = NOW()
      WHERE id = (
        SELECT id
        FROM backtest_jobs
        WHERE (
          (
            status = 'PENDING'
            AND EXISTS (
              SELECT 1
              FROM experiments
              WHERE experiments.id = backtest_jobs."experimentId"
                AND experiments."datasetSnapshotId" IS NOT NULL
            )
          )
          OR (
            status = 'CLAIMED'
            AND (
              "leaseExpiresAt" < NOW()
              OR (
                "leaseExpiresAt" IS NULL
                AND "claimedAt" < NOW() - (${this.leaseDurationMs} * INTERVAL '1 millisecond')
              )
            )
          )
        )
        ORDER BY "createdAt", id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id, "experimentId", status, "claimedAt", "workerId",
        "leaseToken", "leaseExpiresAt", "retryCount", error;
    `;

    const job = jobs[0];
    return job === undefined ? null : normalizeClaimedJob(job);
  }

  public async findById(jobId: string): Promise<Job | null> {
    const job = await this.prisma.backtestJob.findUnique({
      where: { id: jobId },
    });
    return job as unknown as Job | null;
  }

  public async startJob(job: ClaimedBacktestJob): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.backtestJob.updateMany({
        where: leaseWhere(job),
        data: { updatedAt: new Date() },
      });
      if (claimed.count !== 1) throw new JobLeaseLostError(job.id);

      await createOutboxEvent(
        transaction,
        createDomainEvent('BacktestStarted', {
          experimentId: job.experimentId,
          jobId: job.id,
          workerId: job.workerId,
        }),
      );
    });
  }

  public async renewLease(job: ClaimedBacktestJob): Promise<boolean> {
    const result = await this.prisma.backtestJob.updateMany({
      where: leaseWhere(job),
      data: {
        leaseExpiresAt: new Date(Date.now() + this.leaseDurationMs),
        updatedAt: new Date(),
      },
    });
    return result.count === 1;
  }

  public async loadExecutionInput(
    job: ClaimedBacktestJob,
  ): Promise<BacktestExecutionInput> {
    const record = await this.prisma.backtestJob.findFirst({
      include: {
        experiment: {
          include: {
            datasetSnapshot: true,
            strategyVersion: { include: { strategyDefinition: true } },
          },
        },
      },
      where: leaseWhere(job),
    });
    if (record === null || record.experiment.datasetSnapshot === null) {
      throw new Error('Backtest job has no immutable dataset snapshot');
    }

    return {
      candles: parseSnapshotCandles(record.experiment.datasetSnapshot.candles),
      endTime: Number(record.experiment.endTime),
      experimentId: record.experiment.id,
      initialInvestment: toNumber(record.experiment.initialInvestment),
      jobId: record.id,
      pair: record.experiment.pair,
      slippage: toNumber(record.experiment.slippage),
      startTime: Number(record.experiment.startTime),
      strategyId: record.experiment.strategyVersion.strategyDefinition.type,
      strategyParams: record.experiment.strategyVersion.params,
      strategyVersionId: record.experiment.strategyVersionId,
      timeframe: record.experiment
        .timeframe as BacktestExecutionInput['timeframe'],
      transactionCost: toNumber(record.experiment.transactionCost),
    };
  }

  public async completeJob(
    job: ClaimedBacktestJob,
    outcome: PersistedBacktestOutcome,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const experiment = await transaction.experiment.findUnique({
        select: {
          endTime: true,
          ownerId: true,
          pair: true,
          startTime: true,
          strategyVersion: {
            select: {
              params: true,
              strategyDefinition: { select: { name: true, type: true } },
            },
          },
          strategyVersionId: true,
          timeframe: true,
        },
        where: { id: job.experimentId },
      });
      if (experiment === null) return false;
      const strategyKind =
        experiment.strategyVersion.strategyDefinition.type === 'composite'
          ? 'composite'
          : 'singular';
      const strategyDisplay = formatStrategyDisplay(
        strategyKind,
        experiment.strategyVersion.params,
        experiment.strategyVersion.strategyDefinition.name,
      );

      const claimed = await transaction.backtestJob.updateMany({
        data: {
          leaseExpiresAt: null,
          leaseToken: null,
          status: 'COMPLETED',
          updatedAt: new Date(),
          workerId: null,
        },
        where: leaseWhere(job),
      });
      if (claimed.count !== 1) return false;

      if (outcome.trades.length > 0) {
        await transaction.trade.createMany({
          data: outcome.trades.map((trade) => ({
            direction: trade.direction,
            entryPrice: trade.entryPrice,
            entryTime: BigInt(trade.entryTime),
            experimentId: job.experimentId,
            exitPrice: trade.exitPrice,
            exitReason: trade.exitReason,
            exitTime: BigInt(trade.exitTime),
            investment: trade.investment,
            ownerId: experiment.ownerId,
            pair: trade.pair,
            profit: trade.profit,
            slippage: trade.slippage,
            stopLoss: trade.stopLoss,
            takeProfit: trade.takeProfit,
            transactionCost: trade.transactionCost,
          })),
        });
      }

      await transaction.experiment.update({
        data: {
          evaluatorVersion: 'default-v1',
          losses: outcome.metrics.losses,
          maxDrawdown: outcome.metrics.maxDrawdown,
          maxDrawdownAmount: outcome.metrics.maxDrawdownAmount,
          profitFactor: outcome.metrics.profitFactorInfinite
            ? null
            : outcome.metrics.profitFactor,
          profitFactorInfinite: outcome.metrics.profitFactorInfinite,
          return: outcome.metrics.return,
          score: outcome.metrics.score,
          sharpeRatio: outcome.metrics.sharpeRatio,
          totalProfit: outcome.metrics.totalProfit,
          totalTrades: outcome.metrics.totalTrades,
          winRate: outcome.metrics.winRate,
          wins: outcome.metrics.wins,
        },
        where: { id: job.experimentId },
      });

      await createOutboxEvent(
        transaction,
        createDomainEvent('BacktestCompleted', {
          experimentId: job.experimentId,
          jobId: job.id,
        }),
      );
      await createOutboxEvent(
        transaction,
        createDomainEvent('StrategyEvaluated', {
          endTime: Number(experiment.endTime),
          experimentId: job.experimentId,
          maxDrawdown: decimalString(outcome.metrics.maxDrawdown),
          memberStrategies: strategyDisplay.members,
          ownerId: experiment.ownerId,
          pair: experiment.pair,
          return: decimalString(outcome.metrics.return),
          score: decimalString(outcome.metrics.score),
          startTime: Number(experiment.startTime),
          strategyDisplayName: strategyDisplay.name,
          strategyKind,
          strategyVersionId: experiment.strategyVersionId,
          timeframe: experiment.timeframe as Timeframe,
          totalProfit: decimalString(outcome.metrics.totalProfit),
          totalTrades: outcome.metrics.totalTrades,
          winRate: decimalString(outcome.metrics.winRate),
        }),
      );
      return true;
    });
  }

  public async failJob(
    job: ClaimedBacktestJob,
    error: Error,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.backtestJob.findFirst({
        select: { retryCount: true },
        where: leaseWhere(job),
      });
      if (current === null) return false;

      const retryCount = current.retryCount + 1;
      const status = retryCount >= MAX_RETRIES ? 'FAILED' : 'PENDING';
      const updated = await transaction.backtestJob.updateMany({
        data: {
          claimedAt: status === 'PENDING' ? null : job.claimedAt,
          error: error.message,
          leaseExpiresAt: null,
          leaseToken: null,
          retryCount,
          status,
          updatedAt: new Date(),
          workerId: null,
        },
        where: leaseWhere(job),
      });
      return updated.count === 1;
    });
  }
}

interface RawClaimedJob {
  id: string;
  experimentId: string;
  status: string;
  claimedAt: Date | null;
  workerId: string | null;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  retryCount: number;
  error: string | null;
}

function normalizeClaimedJob(job: RawClaimedJob): Job {
  return {
    claimedAt: job.claimedAt,
    error: job.error,
    experimentId: job.experimentId,
    id: job.id,
    leaseExpiresAt: job.leaseExpiresAt,
    leaseToken: job.leaseToken,
    retryCount: job.retryCount,
    status: job.status as Job['status'],
    workerId: job.workerId,
  };
}

function leaseWhere(job: ClaimedBacktestJob) {
  return {
    id: job.id,
    leaseExpiresAt: { gt: new Date() },
    leaseToken: job.leaseToken,
    status: 'CLAIMED' as const,
    workerId: job.workerId,
  };
}

async function createOutboxEvent(
  transaction: Prisma.TransactionClient,
  event: AnyDomainEvent,
): Promise<void> {
  await transaction.outboxEvent.create({
    data: {
      eventId: event.eventId,
      name: event.name,
      occurredAt: new Date(event.occurredAt),
      payload: event.payload as unknown as Prisma.InputJsonValue,
      version: event.version,
    },
  });
}

function parseSnapshotCandles(value: unknown): Candle[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isSnapshotCandle).map((candle) => ({
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

function isSnapshotCandle(value: unknown): value is Record<string, unknown> & {
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
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candle = value as Record<string, unknown>;
  return (
    typeof candle.pair === 'string' &&
    typeof candle.timeframe === 'string' &&
    numberValue(candle.openTime) !== null &&
    numberValue(candle.closeTime) !== null &&
    numberValue(candle.open) !== null &&
    numberValue(candle.high) !== null &&
    numberValue(candle.low) !== null &&
    numberValue(candle.close) !== null &&
    numberValue(candle.volume) !== null &&
    typeof candle.isClosed === 'boolean'
  );
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function decimalString(value: number): string {
  return String(value);
}
