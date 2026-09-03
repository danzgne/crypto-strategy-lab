import type {
  OperationsDeadLetterItem,
  OperationsRecentJobFailure,
  OperationsSnapshot,
  OperationsWorkerInstance,
} from '@crypto-strategy-lab/shared';

import type { OperationsRepository } from '../repositories/interfaces/operationsRepository.interface';
import type { OperationsServiceInterface } from './interfaces/operationsService.interface';

const DEFAULT_STALENESS_THRESHOLD_MS = 30_000;
const MAX_ERROR_SUMMARY_LENGTH = 200;

export function sanitizeErrorMessage(
  raw: string | null | undefined,
  maxLength = MAX_ERROR_SUMMARY_LENGTH,
): string | null {
  if (!raw) return null;

  let sanitized = raw
    // Redact connection strings with credentials (postgres://user:pass@host)
    .replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@\s]+@/gi, '$1[REDACTED]@')
    // Redact Bearer tokens
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [REDACTED]')
    // Redact query or key-value style secrets
    .replace(
      /((?:password|secret|apikey|api_key|token|auth)\s*[:=]\s*["']?)[^"'\s,;}]+/gi,
      '$1[REDACTED]',
    )
    // Redact JSON field values for secrets
    .replace(
      /("(?:password|secret|apiKey|api_key|token|auth)"\s*:\s*")[^"]+(")/gi,
      '$1[REDACTED]$2',
    );

  if (sanitized.length > maxLength) {
    sanitized = `${sanitized.slice(0, maxLength)}...`;
  }

  return sanitized;
}

export interface OperationsServiceOptions {
  stalenessThresholdMs?: number;
  now?: () => Date;
}

export class OperationsService implements OperationsServiceInterface {
  private readonly stalenessThresholdMs: number;

  private readonly now: () => Date;

  public constructor(
    private readonly repository: OperationsRepository,
    options: OperationsServiceOptions = {},
  ) {
    this.stalenessThresholdMs =
      options.stalenessThresholdMs ?? DEFAULT_STALENESS_THRESHOLD_MS;
    this.now = options.now ?? (() => new Date());
  }

  public async getSnapshot(): Promise<OperationsSnapshot> {
    const currentTime = this.now();
    const since24h = new Date(currentTime.getTime() - 24 * 60 * 60 * 1000);

    const [rawJobs, rawRolling24h, rawHeartbeats, rawOutbox, rawFailures] =
      await Promise.all([
        this.repository.getJobStatusCounts(),
        this.repository.getRolling24hMetrics(since24h),
        this.repository.getWorkerHeartbeats(),
        this.repository.getOutboxMetrics(),
        this.repository.getRecentJobFailures(20),
      ]);

    const oldestPendingAgeMs = rawJobs.oldestPendingCreatedAt
      ? Math.max(
          0,
          currentTime.getTime() - rawJobs.oldestPendingCreatedAt.getTime(),
        )
      : null;

    let activeCount = 0;
    let staleCount = 0;
    let stoppedCount = 0;

    const instances: OperationsWorkerInstance[] = rawHeartbeats.map((hb) => {
      let status: 'active' | 'stale' | 'stopped';
      if (hb.stoppedAt !== null) {
        status = 'stopped';
        stoppedCount += 1;
      } else if (
        currentTime.getTime() - hb.lastSeenAt.getTime() >
        this.stalenessThresholdMs
      ) {
        status = 'stale';
        staleCount += 1;
      } else {
        status = 'active';
        activeCount += 1;
      }

      return {
        instanceId: hb.instanceId,
        lastSeenAt: hb.lastSeenAt.toISOString(),
        service: hb.service,
        startedAt: hb.startedAt.toISOString(),
        status,
        stoppedAt: hb.stoppedAt ? hb.stoppedAt.toISOString() : null,
      };
    });

    const oldestUnpublishedAgeMs = rawOutbox.oldestUnpublishedCreatedAt
      ? Math.max(
          0,
          currentTime.getTime() -
            rawOutbox.oldestUnpublishedCreatedAt.getTime(),
        )
      : null;

    const recentDeadLetters: OperationsDeadLetterItem[] =
      rawOutbox.recentDeadLetters.map((dl) => ({
        attemptCount: dl.attemptCount,
        deadLetteredAt: dl.deadLetteredAt.toISOString(),
        eventId: dl.eventId,
        id: dl.id,
        lastError: sanitizeErrorMessage(dl.lastError),
        name: dl.name,
      }));

    const recentFailures: OperationsRecentJobFailure[] = rawFailures.map(
      (f) => ({
        createdAt: f.createdAt.toISOString(),
        errorSummary: sanitizeErrorMessage(f.error),
        experimentId: f.experimentId,
        failedAt: f.failedAt ? f.failedAt.toISOString() : null,
        failureCategory: f.failureCategory,
        jobId: f.jobId,
        retryCount: f.retryCount,
        workerId: f.workerId,
      }),
    );

    return {
      jobs: {
        countByStatus: rawJobs.counts,
        oldestPendingAgeMs,
      },
      outbox: {
        deadLetterCount: rawOutbox.deadLetterCount,
        eligibleBacklog: rawOutbox.eligibleBacklog,
        oldestUnpublishedAgeMs,
        recentDeadLetters,
        retryingCount: rawOutbox.retryingCount,
      },
      queriedAt: currentTime.toISOString(),
      recentFailures,
      rolling24h: {
        executionP50Ms: rawRolling24h.executionP50Ms,
        executionP95Ms: rawRolling24h.executionP95Ms,
        failures: rawRolling24h.failures,
        leaseLosses: rawRolling24h.leaseLosses,
        queueWaitP50Ms: rawRolling24h.queueWaitP50Ms,
        queueWaitP95Ms: rawRolling24h.queueWaitP95Ms,
        retries: rawRolling24h.retries,
        throughput: rawRolling24h.throughput,
      },
      workers: {
        activeCount,
        instances,
        staleCount,
        stoppedCount,
      },
    };
  }
}
