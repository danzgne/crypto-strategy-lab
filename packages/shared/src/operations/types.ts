export interface OperationsWorkerInstance {
  instanceId: string;
  service: string;
  startedAt: string;
  lastSeenAt: string;
  stoppedAt: string | null;
  status: 'active' | 'stale' | 'stopped';
}

export interface OperationsDeadLetterItem {
  id: string;
  eventId: string;
  name: string;
  attemptCount: number;
  deadLetteredAt: string;
  lastError: string | null;
}

export interface OperationsRecentJobFailure {
  jobId: string;
  experimentId: string;
  workerId: string | null;
  retryCount: number;
  failureCategory: 'TRANSIENT' | 'PERMANENT' | null;
  failedAt: string | null;
  createdAt: string;
  errorSummary: string | null;
}

export interface OperationsSnapshot {
  queriedAt: string;

  jobs: {
    countByStatus: Record<
      'PENDING' | 'CLAIMED' | 'COMPLETED' | 'FAILED',
      number
    >;
    oldestPendingAgeMs: number | null;
  };

  rolling24h: {
    throughput: number;
    failures: number;
    retries: number;
    leaseLosses: number;
    queueWaitP50Ms: number | null;
    queueWaitP95Ms: number | null;
    executionP50Ms: number | null;
    executionP95Ms: number | null;
  };

  workers: {
    instances: OperationsWorkerInstance[];
    activeCount: number;
    staleCount: number;
    stoppedCount: number;
  };

  outbox: {
    eligibleBacklog: number;
    oldestUnpublishedAgeMs: number | null;
    retryingCount: number;
    deadLetterCount: number;
    recentDeadLetters: OperationsDeadLetterItem[];
  };

  recentFailures: OperationsRecentJobFailure[];
}
