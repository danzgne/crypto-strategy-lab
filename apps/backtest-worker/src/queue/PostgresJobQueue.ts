import type { IJobQueue, Job } from '@crypto-strategy-lab/shared';
import type { JobRepository } from '../repositories/interfaces/jobRepository.interface';

export class PostgresJobQueue implements IJobQueue {
  constructor(private repository: JobRepository) {}

  async enqueue(experimentId: string, ownerId: string): Promise<string> {
    return this.repository.createJob(experimentId, ownerId);
  }

  async claim(workerId: string): Promise<Job | null> {
    return this.repository.claimNextJob(workerId);
  }

  async complete(jobId: string, _result?: unknown): Promise<void> {
    await this.repository.updateJobStatus(jobId, 'COMPLETED');
  }

  async fail(jobId: string, error: Error): Promise<void> {
    const job = await this.repository.findById(jobId);
    if (!job) return;

    const nextRetry = job.retryCount + 1;
    const isPermFailed = nextRetry >= 4;
    const nextStatus = isPermFailed ? 'FAILED' : 'PENDING';
    const nextClaimedAt = nextStatus === 'PENDING' ? null : job.claimedAt;

    await this.repository.updateJobFailure(
      jobId,
      error.message,
      nextRetry,
      nextStatus,
      nextClaimedAt
    );
  }
}
