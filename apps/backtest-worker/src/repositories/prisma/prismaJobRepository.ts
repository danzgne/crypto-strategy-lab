import { randomUUID } from 'node:crypto';

import type {
  AnyDomainEvent,
  Candle,
  Job,
  JobFailureCategory,
  Timeframe,
} from '@crypto-strategy-lab/shared';
import {
  classifyError,
  computeNextEligibleAt,
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
import { InvalidDatasetSnapshotError } from '../../errors/InvalidDatasetSnapshotError';
import { InvalidConfigError } from '../../errors/InvalidConfigError';

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

    return this.prisma.$transaction(async (transaction) => {
      // 1. Reap terminal expired leases (attempt 4 timed out)
      const terminalExpired = await transaction.$queryRaw<
        Array<{ id: string; experimentId: string }>
      >`
        UPDATE backtest_jobs
        SET status = 'FAILED',
            "failedAt" = NOW(),
            "failureCategory" = 'TRANSIENT',
            error = 'Job lease expired after maximum attempts',
            "leaseExpiresAt" = NULL,
            "leaseToken" = NULL,
            "retryCount" = "retryCount" + 1,
            "updatedAt" = NOW()
        WHERE id IN (
          SELECT id
          FROM backtest_jobs
          WHERE status = 'CLAIMED'
            AND (
              "leaseExpiresAt" < NOW()
              OR (
                "leaseExpiresAt" IS NULL
                AND "claimedAt" < NOW() - (${this.leaseDurationMs} * INTERVAL '1 millisecond')
              )
            )
            AND "retryCount" >= ${MAX_RETRIES - 1}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, "experimentId";
      `;

      for (const reaped of terminalExpired) {
        await createOutboxEvent(
          transaction,
          createDomainEvent('BacktestCompleted', {
            experimentId: reaped.experimentId,
            jobId: reaped.id,
          }),
        );
      }

      // 2. Claim next eligible job with deterministic schedule/creation ordering
      const jobs = await transaction.$queryRaw<RawClaimedJob[]>`
        UPDATE backtest_jobs
        SET status = 'CLAIMED',
            "claimedAt" = NOW(),
            "workerId" = ${workerId},
            "leaseToken" = ${leaseToken},
            "leaseExpiresAt" = NOW() + (${this.leaseDurationMs} * INTERVAL '1 millisecond'),
            "retryCount" = CASE
              WHEN backtest_jobs.status = 'CLAIMED' THEN backtest_jobs."retryCount" + 1
              ELSE backtest_jobs."retryCount"
            END,
            "updatedAt" = NOW()
        WHERE id = (
          SELECT id
          FROM backtest_jobs
          WHERE (
            (
              status = 'PENDING'
              AND ("nextEligibleAt" IS NULL OR "nextEligibleAt" <= NOW())
              AND EXISTS (
                SELECT 1
                FROM experiments
                WHERE experiments.id = backtest_jobs."experimentId"
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
              AND "retryCount" < ${MAX_RETRIES - 1}
            )
          )
          ORDER BY COALESCE("nextEligibleAt", "createdAt") ASC, "createdAt" ASC, id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        RETURNING id, "experimentId", status, "claimedAt", "workerId",
          "leaseToken", "leaseExpiresAt", "retryCount", error, "failureCategory",
          "nextEligibleAt", "failedAt", "createdAt", "updatedAt";
      `;

      const job = jobs[0];
      return job === undefined ? null : normalizeClaimedJob(job);
    });
  }

  public async findById(jobId: string): Promise<Job | null> {
    const job = await this.prisma.backtestJob.findUnique({
      where: { id: jobId },
    });
    if (job === null) return null;
    return {
      claimedAt: job.claimedAt,
      createdAt: job.createdAt,
      error: job.error,
      experimentId: job.experimentId,
      failureCategory: job.failureCategory as Job['failureCategory'],
      failedAt: job.failedAt,
      id: job.id,
      leaseExpiresAt: job.leaseExpiresAt,
      leaseToken: job.leaseToken,
      nextEligibleAt: job.nextEligibleAt,
      retryCount: job.retryCount,
      status: job.status as Job['status'],
      updatedAt: job.updatedAt,
      workerId: job.workerId,
    };
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
    if (record === null) {
      throw new JobLeaseLostError(job.id);
    }
    if (record.experiment.datasetSnapshot === null) {
      throw new InvalidDatasetSnapshotError(
        'Backtest job has no immutable dataset snapshot',
      );
    }

    const initialInvestment = validateExecutionNumber(
      record.experiment.initialInvestment,
      'Initial investment',
      (n) => n > 0,
      'Initial investment must be a finite positive number',
    );
    const slippage = validateExecutionInteger(
      record.experiment.slippage,
      'Slippage',
      (n) => n >= 0 && n < 10_000,
      'Slippage must be an integer number of basis points in [0, 10000)',
    );
    const transactionCost = validateExecutionNumber(
      record.experiment.transactionCost,
      'Transaction cost',
      (n) => n >= 0 && n < 1,
      'Transaction cost must be a finite ratio in [0, 1)',
    );
    const startTime = Number(record.experiment.startTime);
    const endTime = Number(record.experiment.endTime);
    if (
      !Number.isSafeInteger(startTime) ||
      !Number.isSafeInteger(endTime) ||
      startTime < 0 ||
      endTime <= startTime
    ) {
      throw new InvalidConfigError(
        'Backtest range must have a finite end after its start',
      );
    }

    const pair = record.experiment.pair;
    const timeframe = record.experiment
      .timeframe as BacktestExecutionInput['timeframe'];

    const candles = parseSnapshotCandles(
      record.experiment.datasetSnapshot.candles,
      pair,
      timeframe,
    );

    return {
      buildRevision: record.experiment.buildRevision,
      candles,
      endTime,
      evaluatorVersion: record.experiment.evaluatorVersion,
      experimentId: record.experiment.id,
      initialInvestment,
      jobId: record.id,
      pair,
      simulationRulesVersion: record.experiment.simulationRulesVersion,
      slippage,
      startTime,
      strategyId: record.experiment.strategyVersion.strategyDefinition.type,
      strategyImplementationVersion:
        record.experiment.strategyImplementationVersion,
      strategyParams: record.experiment.strategyVersion.params,
      strategyVersionId: record.experiment.strategyVersionId,
      timeframe,
      transactionCost,
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
              strategyDefinition: {
                select: { candidateMemberLabels: true, name: true, type: true },
              },
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
      const candidateMemberLabels =
        experiment.strategyVersion.strategyDefinition.candidateMemberLabels;
      const strategyDisplay = formatStrategyDisplay(
        strategyKind,
        experiment.strategyVersion.params,
        experiment.strategyVersion.strategyDefinition.name,
        Array.isArray(candidateMemberLabels)
          ? (candidateMemberLabels as (string | null)[])
          : null,
      );

      const claimed = await transaction.backtestJob.updateMany({
        data: {
          leaseExpiresAt: null,
          leaseToken: null,
          status: 'COMPLETED',
          updatedAt: new Date(),
          workerId: job.workerId,
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
    category?: JobFailureCategory,
  ): Promise<boolean> {
    const failureCategory = category ?? classifyError(error);

    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.backtestJob.findFirst({
        select: { retryCount: true },
        where: leaseWhere(job),
      });
      if (current === null) return false;

      const retryCount = current.retryCount + 1;
      let status: 'PENDING' | 'FAILED';
      let nextEligibleAt: Date | null = null;
      let failedAt: Date | null = null;

      if (failureCategory === 'PERMANENT') {
        status = 'FAILED';
        failedAt = new Date();
      } else if (retryCount >= MAX_RETRIES) {
        status = 'FAILED';
        failedAt = new Date();
      } else {
        status = 'PENDING';
        nextEligibleAt = computeNextEligibleAt(retryCount);
      }

      const updated = await transaction.backtestJob.updateMany({
        data: {
          claimedAt: status === 'PENDING' ? null : job.claimedAt,
          error: error.message,
          failedAt,
          failureCategory,
          leaseExpiresAt: null,
          leaseToken: null,
          nextEligibleAt,
          retryCount,
          status,
          updatedAt: new Date(),
          workerId: status === 'PENDING' ? null : job.workerId,
        },
        where: leaseWhere(job),
      });

      if (updated.count !== 1) return false;

      if (status === 'FAILED') {
        await createOutboxEvent(
          transaction,
          createDomainEvent('BacktestCompleted', {
            experimentId: job.experimentId,
            jobId: job.id,
          }),
        );
      }

      return true;
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
  failureCategory: string | null;
  nextEligibleAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function normalizeClaimedJob(job: RawClaimedJob): Job {
  return {
    claimedAt: job.claimedAt,
    createdAt: job.createdAt,
    error: job.error,
    experimentId: job.experimentId,
    failureCategory: job.failureCategory as Job['failureCategory'],
    failedAt: job.failedAt,
    id: job.id,
    leaseExpiresAt: job.leaseExpiresAt,
    leaseToken: job.leaseToken,
    nextEligibleAt: job.nextEligibleAt,
    retryCount: job.retryCount,
    status: job.status as Job['status'],
    updatedAt: job.updatedAt,
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

function parseSnapshotCandles(
  value: unknown,
  expectedPair: string,
  expectedTimeframe: string,
): Candle[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new InvalidDatasetSnapshotError(
      'Dataset snapshot must contain a non-empty array of candles',
    );
  }
  return value.map((candle, index) => {
    if (!isSnapshotCandle(candle)) {
      throw new InvalidDatasetSnapshotError(
        `Dataset snapshot contains malformed candle data at index ${index}`,
      );
    }
    if (
      candle.pair !== expectedPair ||
      candle.timeframe !== expectedTimeframe
    ) {
      throw new InvalidDatasetSnapshotError(
        `Dataset snapshot candle market mismatch: expected ${expectedPair}/${expectedTimeframe}, got ${candle.pair}/${candle.timeframe}`,
      );
    }
    return {
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
    };
  });
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
  const openTime = numberValue(candle.openTime);
  const closeTime = numberValue(candle.closeTime);
  const open = numberValue(candle.open);
  const high = numberValue(candle.high);
  const low = numberValue(candle.low);
  const close = numberValue(candle.close);
  const volume = numberValue(candle.volume);

  return (
    typeof candle.pair === 'string' &&
    candle.pair.length > 0 &&
    typeof candle.timeframe === 'string' &&
    candle.timeframe.length > 0 &&
    openTime !== null &&
    closeTime !== null &&
    openTime < closeTime &&
    open !== null &&
    open > 0 &&
    high !== null &&
    high > 0 &&
    low !== null &&
    low > 0 &&
    close !== null &&
    close > 0 &&
    volume !== null &&
    volume >= 0 &&
    candle.isClosed === true
  );
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateExecutionNumber(
  value: unknown,
  field: string,
  predicate: (num: number) => boolean,
  errorMessage: string,
): number {
  if (value === null || value === undefined) {
    throw new InvalidConfigError(`${field} is required`);
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || !predicate(parsed)) {
    throw new InvalidConfigError(errorMessage);
  }
  return parsed;
}

function validateExecutionInteger(
  value: unknown,
  field: string,
  predicate: (num: number) => boolean,
  errorMessage: string,
): number {
  if (value === null || value === undefined) {
    throw new InvalidConfigError(`${field} is required`);
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || !predicate(parsed)) {
    throw new InvalidConfigError(errorMessage);
  }
  return parsed;
}

function decimalString(value: number): string {
  return String(value);
}
