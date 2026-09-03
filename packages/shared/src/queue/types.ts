export type JobFailureCategory = 'TRANSIENT' | 'PERMANENT';

export interface Job {
  id: string;
  experimentId: string;
  status: 'PENDING' | 'CLAIMED' | 'COMPLETED' | 'FAILED';
  claimedAt: Date | null;
  workerId: string | null;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  retryCount: number;
  error: string | null;
  failureCategory?: JobFailureCategory | null | undefined;
  nextEligibleAt?: Date | null | undefined;
  failedAt?: Date | null | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface IJobQueue {
  enqueue(experimentId: string, ownerId: string): Promise<string>;
  claim(workerId: string): Promise<Job | null>;
  complete(jobId: string, result?: unknown): Promise<void>;
  fail(jobId: string, error: Error): Promise<void>;
}
