export interface RawJobCounts {
  counts: Record<'PENDING' | 'CLAIMED' | 'COMPLETED' | 'FAILED', number>;
  oldestPendingCreatedAt: Date | null;
}

export interface RawRolling24hMetrics {
  throughput: number;
  failures: number;
  retries: number;
  leaseLosses: number;
  queueWaitP50Ms: number | null;
  queueWaitP95Ms: number | null;
  executionP50Ms: number | null;
  executionP95Ms: number | null;
}

export interface RawWorkerHeartbeat {
  service: string;
  instanceId: string;
  startedAt: Date;
  lastSeenAt: Date;
  stoppedAt: Date | null;
}

export interface RawDeadLetter {
  id: string;
  eventId: string;
  name: string;
  attemptCount: number;
  deadLetteredAt: Date;
  lastError: string | null;
}

export interface RawOutboxMetrics {
  eligibleBacklog: number;
  oldestUnpublishedCreatedAt: Date | null;
  retryingCount: number;
  deadLetterCount: number;
  recentDeadLetters: RawDeadLetter[];
}

export interface RawJobFailure {
  jobId: string;
  experimentId: string;
  workerId: string | null;
  retryCount: number;
  failureCategory: 'TRANSIENT' | 'PERMANENT' | null;
  failedAt: Date | null;
  createdAt: Date;
  error: string | null;
}

export interface OperationsRepository {
  getJobStatusCounts(): Promise<RawJobCounts>;
  getRolling24hMetrics(since: Date): Promise<RawRolling24hMetrics>;
  getWorkerHeartbeats(): Promise<RawWorkerHeartbeat[]>;
  getOutboxMetrics(): Promise<RawOutboxMetrics>;
  getRecentJobFailures(limit?: number): Promise<RawJobFailure[]>;
}
