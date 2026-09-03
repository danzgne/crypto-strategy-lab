import type { Job, JobFailureCategory } from '@crypto-strategy-lab/shared';
import type {
  BacktestExecutionInput,
  ClaimedBacktestJob,
  PersistedBacktestOutcome,
} from '../../worker/types';

export interface JobRepository {
  createJob(experimentId: string, ownerId: string): Promise<string>;
  claimNextJob(workerId: string): Promise<Job | null>;
  findById(jobId: string): Promise<Job | null>;
  startJob(job: ClaimedBacktestJob): Promise<void>;
  renewLease(job: ClaimedBacktestJob): Promise<boolean>;
  loadExecutionInput(job: ClaimedBacktestJob): Promise<BacktestExecutionInput>;
  completeJob(
    job: ClaimedBacktestJob,
    outcome: PersistedBacktestOutcome,
  ): Promise<boolean>;
  failJob(
    job: ClaimedBacktestJob,
    error: Error,
    category?: JobFailureCategory,
  ): Promise<boolean>;
}
