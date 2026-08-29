import type { Job } from '@crypto-strategy-lab/shared';

export interface JobRepository {
  createJob(experimentId: string, ownerId: string): Promise<string>;
  claimNextJob(workerId: string): Promise<Job | null>;
  updateJobStatus(jobId: string, status: Job['status']): Promise<void>;
  findById(jobId: string): Promise<Job | null>;
  updateJobFailure(
    jobId: string,
    error: string,
    retryCount: number,
    status: Job['status'],
    claimedAt: Date | null,
  ): Promise<void>;
}
