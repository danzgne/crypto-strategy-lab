import type {
  IJobQueue,
  Job,
  JobFailureCategory,
} from '@crypto-strategy-lab/shared';
import type { JobRepository } from '../repositories/interfaces/jobRepository.interface';
import type {
  BacktestExecutionInput,
  ClaimedBacktestJob,
  PersistedBacktestOutcome,
} from '../worker/types';

export interface BacktestJobQueue extends IJobQueue {
  claim(workerId: string): Promise<ClaimedBacktestJob | null>;
  start(job: ClaimedBacktestJob): Promise<void>;
  renew(job: ClaimedBacktestJob): Promise<boolean>;
  loadInput(job: ClaimedBacktestJob): Promise<BacktestExecutionInput>;
  completeClaim(
    job: ClaimedBacktestJob,
    outcome: PersistedBacktestOutcome,
  ): Promise<boolean>;
  failClaim(
    job: ClaimedBacktestJob,
    error: Error,
    category?: JobFailureCategory,
  ): Promise<boolean>;
}

export class PostgresJobQueue implements BacktestJobQueue {
  public constructor(private readonly repository: JobRepository) {}

  async enqueue(experimentId: string, ownerId: string): Promise<string> {
    return this.repository.createJob(experimentId, ownerId);
  }

  async claim(workerId: string): Promise<ClaimedBacktestJob | null> {
    const job = await this.repository.claimNextJob(workerId);
    if (
      job === null ||
      job.workerId === null ||
      job.leaseToken === null ||
      job.leaseExpiresAt === null
    ) {
      return null;
    }
    return {
      ...job,
      leaseExpiresAt: job.leaseExpiresAt,
      leaseToken: job.leaseToken,
      workerId: job.workerId,
    };
  }

  async start(job: ClaimedBacktestJob): Promise<void> {
    await this.repository.startJob(job);
  }

  async renew(job: ClaimedBacktestJob): Promise<boolean> {
    return this.repository.renewLease(job);
  }

  async loadInput(job: ClaimedBacktestJob): Promise<BacktestExecutionInput> {
    return this.repository.loadExecutionInput(job);
  }

  async completeClaim(
    job: ClaimedBacktestJob,
    outcome: PersistedBacktestOutcome,
  ): Promise<boolean> {
    return this.repository.completeJob(job, outcome);
  }

  async failClaim(
    job: ClaimedBacktestJob,
    error: Error,
    category?: JobFailureCategory,
  ): Promise<boolean> {
    return this.repository.failJob(job, error, category);
  }

  async complete(jobId: string, _result?: unknown): Promise<void> {
    const job = toClaimedJob(await this.repository.findById(jobId));
    if (job === null) {
      throw new Error(`Backtest job ${jobId} has no active lease`);
    }
    if (!isPersistedBacktestOutcome(_result)) {
      throw new Error(
        'Lease-bound completion requires a persisted backtest outcome',
      );
    }
    const persisted = await this.completeClaim(job, _result);
    if (!persisted) {
      throw new Error(`Backtest job ${jobId} lease is no longer valid`);
    }
  }

  async fail(jobId: string, error: Error): Promise<void> {
    const job = toClaimedJob(await this.repository.findById(jobId));
    if (job === null) return;
    await this.failClaim(job, error);
  }
}

function toClaimedJob(job: Job | null): ClaimedBacktestJob | null {
  if (
    job === null ||
    job.status !== 'CLAIMED' ||
    job.workerId === null ||
    job.leaseToken === null ||
    job.leaseExpiresAt === null
  ) {
    return null;
  }
  return {
    ...job,
    leaseExpiresAt: job.leaseExpiresAt,
    leaseToken: job.leaseToken,
    workerId: job.workerId,
  };
}

function isPersistedBacktestOutcome(
  value: unknown,
): value is PersistedBacktestOutcome {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { trades?: unknown }).trades) &&
    (value as { metrics?: unknown }).metrics !== undefined
  );
}
