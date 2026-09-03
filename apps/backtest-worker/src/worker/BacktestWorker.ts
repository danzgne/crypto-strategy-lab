import type { CompositeStrategyRequest } from '@crypto-strategy-lab/shared';
import { classifyError } from '@crypto-strategy-lab/shared';
import '@crypto-strategy-lab/strategy-engine/strategies';
import {
  assertStrategyApplicable,
  assertStrategyBacktestable,
  CombinationEngine,
  StrategyRegistry,
  type Strategy,
} from '@crypto-strategy-lab/strategy-engine';

import { HistoricalBacktester, type Backtester } from '../backtesting';
import { DefaultEvaluator, type Evaluator } from '../evaluation';
import {
  InvalidConfigError,
  JobLeaseLostError,
  UnsupportedExecutionInputError,
} from '../errors';
import type { AppLogger } from '../utils/logger';
import type { BacktestJobQueue } from '../queue/PostgresJobQueue';
import type { ClaimedBacktestJob, BacktestExecutionInput } from './types';

export interface BacktestWorkerOptions {
  pollIntervalMs?: number;
  maxPollIntervalMs?: number;
  leaseRenewIntervalMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_MAX_POLL_INTERVAL_MS = 10_000;
const DEFAULT_LEASE_RENEW_INTERVAL_MS = 60_000;

export class BacktestWorker {
  private isRunning = false;

  private readonly pollIntervalMs: number;

  private readonly maxPollIntervalMs: number;

  private readonly leaseRenewIntervalMs: number;

  private loopPromise: Promise<void> | null = null;

  public constructor(
    private readonly workerId: string,
    private readonly queue: BacktestJobQueue,
    private readonly logger: AppLogger,
    private readonly backtester: Backtester = new HistoricalBacktester(),
    private readonly evaluator: Evaluator = new DefaultEvaluator(),
    options: BacktestWorkerOptions = {},
  ) {
    this.pollIntervalMs = Math.max(
      100,
      options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    );
    this.maxPollIntervalMs = Math.max(
      this.pollIntervalMs,
      options.maxPollIntervalMs ?? DEFAULT_MAX_POLL_INTERVAL_MS,
    );
    this.leaseRenewIntervalMs = Math.max(
      250,
      options.leaseRenewIntervalMs ?? DEFAULT_LEASE_RENEW_INTERVAL_MS,
    );
  }

  public start(): void {
    if (this.loopPromise !== null) return;
    this.isRunning = true;
    this.logger.info({ workerId: this.workerId }, 'Backtest worker started');
    this.loopPromise = this.loop().catch((error: unknown) => {
      this.logger.error(
        { err: error, workerId: this.workerId },
        'Backtest worker loop stopped unexpectedly',
      );
    });
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    this.logger.info({ workerId: this.workerId }, 'Backtest worker stopping');
    const loopPromise = this.loopPromise;
    if (loopPromise !== null) await loopPromise;
    this.loopPromise = null;
  }

  private async loop(): Promise<void> {
    let currentPollInterval = this.pollIntervalMs;
    try {
      while (this.isRunning) {
        try {
          const job = await this.queue.claim(this.workerId);
          if (job === null) {
            await this.sleep(currentPollInterval);
            currentPollInterval = Math.min(
              Math.ceil(currentPollInterval * 1.5),
              this.maxPollIntervalMs,
            );
            continue;
          }

          currentPollInterval = this.pollIntervalMs;
          this.logger.info(
            { jobId: job.id, workerId: this.workerId },
            'Claimed backtest job',
          );
          await this.processJob(job);
        } catch (error) {
          this.logger.error(
            { err: error, workerId: this.workerId },
            'Backtest worker polling failed',
          );
          await this.sleep(currentPollInterval);
        }
      }
    } finally {
      this.logger.info(
        { workerId: this.workerId },
        'Backtest worker loop exited',
      );
    }
  }

  private async processJob(job: ClaimedBacktestJob): Promise<void> {
    let leaseLost = false;
    let leaseTimer: ReturnType<typeof setInterval> | undefined;
    const executionStartTime = Date.now();
    const queueWaitMs = job.createdAt
      ? Math.max(
          0,
          (job.claimedAt?.getTime() ?? executionStartTime) -
            job.createdAt.getTime(),
        )
      : null;

    try {
      await this.queue.start(job);
      leaseTimer = setInterval(() => {
        void this.queue
          .renew(job)
          .then((renewed) => {
            if (!renewed) leaseLost = true;
          })
          .catch((error: unknown) => {
            leaseLost = true;
            this.logger.error(
              {
                err: error,
                jobId: job.id,
                workerId: this.workerId,
                leaseLost: true,
              },
              'Backtest job lease renewal failed',
            );
          });
      }, this.leaseRenewIntervalMs);
      leaseTimer.unref();

      const input = await this.queue.loadInput(job);
      const strategy = safelyCreateStrategy(input);
      safelyAssertStrategy(strategy, input.pair, input.timeframe);
      const simulation = this.backtester.run({ ...input, strategy });
      if (leaseLost) throw new JobLeaseLostError(job.id);

      const metrics = this.evaluator.evaluate(
        simulation.trades,
        input.initialInvestment,
      );
      const persisted = await this.queue.completeClaim(job, {
        metrics,
        trades: simulation.trades,
      });
      if (!persisted) throw new JobLeaseLostError(job.id);

      const executionDurationMs = Date.now() - executionStartTime;
      this.logger.info(
        {
          attempt: job.retryCount,
          executionDurationMs,
          experimentId: job.experimentId,
          jobId: job.id,
          queueWaitMs,
          workerId: this.workerId,
        },
        'Backtest job completed',
      );
    } catch (error) {
      const executionDurationMs = Date.now() - executionStartTime;
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      const failureCategory = classifyError(normalizedError);

      this.logger.error(
        {
          attempt: job.retryCount,
          err: normalizedError,
          executionDurationMs,
          experimentId: job.experimentId,
          failureCategory,
          jobId: job.id,
          leaseLost,
          queueWaitMs,
          workerId: this.workerId,
        },
        'Backtest job failed',
      );
      try {
        const failed = await this.queue.failClaim(
          job,
          normalizedError,
          failureCategory,
        );
        if (!failed) {
          this.logger.warn(
            {
              attempt: job.retryCount,
              failureCategory,
              jobId: job.id,
              leaseLost: true,
              workerId: this.workerId,
            },
            'Backtest failure could not be recorded because the lease was lost',
          );
        }
      } catch (failureError) {
        this.logger.error(
          {
            attempt: job.retryCount,
            err: failureError,
            failureCategory,
            jobId: job.id,
            workerId: this.workerId,
          },
          'Backtest failure persistence failed',
        );
      }
    } finally {
      if (leaseTimer !== undefined) clearInterval(leaseTimer);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function safelyCreateStrategy(input: BacktestExecutionInput): Strategy {
  try {
    return createStrategy(input);
  } catch (error) {
    if (error instanceof InvalidConfigError) throw error;
    throw new InvalidConfigError(
      error instanceof Error ? error.message : String(error),
    );
  }
}

function safelyAssertStrategy(
  strategy: Strategy,
  pair: BacktestExecutionInput['pair'],
  timeframe: BacktestExecutionInput['timeframe'],
): void {
  try {
    assertStrategyBacktestable(strategy);
    assertStrategyApplicable(strategy, pair, timeframe);
  } catch (error) {
    throw new UnsupportedExecutionInputError(
      error instanceof Error ? error.message : String(error),
    );
  }
}

function createStrategy(input: BacktestExecutionInput): Strategy {
  if (input.strategyId !== 'composite') {
    return StrategyRegistry.create(input.strategyId, input.strategyParams);
  }
  if (!isCompositeRequest(input.strategyParams)) {
    throw new InvalidConfigError(
      'Stored composite strategy definition is invalid',
    );
  }
  const engine = new CombinationEngine();
  const members = input.strategyParams.members.map((member) => {
    const strategy = StrategyRegistry.create(member.strategyId, member.params);
    assertStrategyBacktestable(strategy);
    return member.weight === undefined
      ? { strategy }
      : { strategy, weight: member.weight };
  });
  return engine.assemble({
    members,
    mode: input.strategyParams.mode,
    ...(input.strategyParams.threshold === undefined
      ? {}
      : { threshold: input.strategyParams.threshold }),
    ...(input.strategyParams.stopLoss === undefined
      ? {}
      : { stopLoss: input.strategyParams.stopLoss }),
    ...(input.strategyParams.takeProfit === undefined
      ? {}
      : { takeProfit: input.strategyParams.takeProfit }),
  });
}

function isCompositeRequest(value: unknown): value is CompositeStrategyRequest {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { members?: unknown }).members)
  );
}
