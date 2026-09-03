import { describe, expect, it, vi } from 'vitest';

import type { OperationsRepository } from '@/api/features/admin/repositories/interfaces/operationsRepository.interface';
import {
  OperationsService,
  sanitizeErrorMessage,
} from '@/api/features/admin/services/operationsService';

describe('sanitizeErrorMessage', () => {
  it('returns null for falsy error messages', () => {
    expect(sanitizeErrorMessage(null)).toBeNull();
    expect(sanitizeErrorMessage(undefined)).toBeNull();
    expect(sanitizeErrorMessage('')).toBeNull();
  });

  it('redacts database credentials in connection strings', () => {
    const raw =
      'Connection failed to postgresql://admin_user:SuperSecretPassword123@postgres.internal:5432/cryptodb';
    const sanitized = sanitizeErrorMessage(raw);
    expect(sanitized).toBe(
      'Connection failed to postgresql://admin_user:[REDACTED]@postgres.internal:5432/cryptodb',
    );
    expect(sanitized).not.toContain('SuperSecretPassword123');
  });

  it('redacts Bearer tokens', () => {
    const raw =
      'Unauthorized response with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secretpayload';
    const sanitized = sanitizeErrorMessage(raw);
    expect(sanitized).toBe('Unauthorized response with Bearer [REDACTED]');
    expect(sanitized).not.toContain('secretpayload');
  });

  it('redacts apiKey, password, and secret tokens in query and JSON formats', () => {
    const raw =
      'Failed at url?apiKey=my-api-key-12345&other=ok and {"password": "mypassword"}';
    const sanitized = sanitizeErrorMessage(raw);
    expect(sanitized).toContain('apiKey=[REDACTED]');
    expect(sanitized).toContain('{"password": "[REDACTED]"}');
    expect(sanitized).not.toContain('my-api-key-12345');
    expect(sanitized).not.toContain('mypassword');
  });

  it('truncates messages exceeding max length', () => {
    const raw = 'a'.repeat(250);
    const sanitized = sanitizeErrorMessage(raw, 200);
    expect(sanitized?.length).toBe(203); // 200 + '...'
    expect(sanitized?.endsWith('...')).toBe(true);
  });
});

describe('OperationsService', () => {
  const fixedNow = new Date('2026-09-03T12:00:00.000Z');

  function createMockRepo(): OperationsRepository {
    return {
      getJobStatusCounts: vi.fn().mockResolvedValue({
        counts: {
          PENDING: 5,
          CLAIMED: 2,
          COMPLETED: 100,
          FAILED: 3,
        },
        oldestPendingCreatedAt: new Date('2026-09-03T11:50:00.000Z'), // 10 minutes = 600,000 ms ago
      }),
      getRolling24hMetrics: vi.fn().mockResolvedValue({
        throughput: 80,
        failures: 2,
        retries: 5,
        leaseLosses: 1,
        queueWaitP50Ms: 120,
        queueWaitP95Ms: 450,
        executionP50Ms: 2500,
        executionP95Ms: 5000,
      }),
      getWorkerHeartbeats: vi.fn().mockResolvedValue([
        {
          service: 'backtest-worker',
          instanceId: 'worker-active-1',
          startedAt: new Date('2026-09-03T10:00:00.000Z'),
          lastSeenAt: new Date('2026-09-03T11:59:50.000Z'), // 10s ago (< 30s threshold -> active)
          stoppedAt: null,
        },
        {
          service: 'backtest-worker',
          instanceId: 'worker-stale-2',
          startedAt: new Date('2026-09-03T09:00:00.000Z'),
          lastSeenAt: new Date('2026-09-03T11:58:00.000Z'), // 120s ago (> 30s threshold -> stale)
          stoppedAt: null,
        },
        {
          service: 'backtest-worker',
          instanceId: 'worker-stopped-3',
          startedAt: new Date('2026-09-03T08:00:00.000Z'),
          lastSeenAt: new Date('2026-09-03T11:00:00.000Z'),
          stoppedAt: new Date('2026-09-03T11:00:00.000Z'), // stoppedAt present -> stopped
        },
      ]),
      getOutboxMetrics: vi.fn().mockResolvedValue({
        eligibleBacklog: 12,
        oldestUnpublishedCreatedAt: new Date('2026-09-03T11:55:00.000Z'), // 5 mins = 300,000 ms ago
        retryingCount: 2,
        deadLetterCount: 1,
        recentDeadLetters: [
          {
            id: 'dl-1',
            eventId: 'evt-1',
            name: 'BacktestCompleted',
            attemptCount: 8,
            deadLetteredAt: new Date('2026-09-03T11:45:00.000Z'),
            lastError: 'Failed with postgresql://user:secret@localhost:5432/db',
          },
        ],
      }),
      getRecentJobFailures: vi.fn().mockResolvedValue([
        {
          jobId: 'job-1',
          experimentId: 'exp-1',
          workerId: 'worker-stale-2',
          retryCount: 3,
          failureCategory: 'TRANSIENT',
          failedAt: new Date('2026-09-03T11:40:00.000Z'),
          createdAt: new Date('2026-09-03T11:30:00.000Z'),
          error: 'Connection timed out with apiKey=confidentialKey123',
        },
      ]),
    };
  }

  it('produces a full typed operations snapshot with correct metrics and classifications', async () => {
    const repo = createMockRepo();
    const service = new OperationsService(repo, {
      now: () => fixedNow,
      stalenessThresholdMs: 30_000,
    });

    const snapshot = await service.getSnapshot();

    expect(snapshot.queriedAt).toBe(fixedNow.toISOString());

    // Jobs
    expect(snapshot.jobs.countByStatus).toEqual({
      PENDING: 5,
      CLAIMED: 2,
      COMPLETED: 100,
      FAILED: 3,
    });
    expect(snapshot.jobs.oldestPendingAgeMs).toBe(600_000);

    // Rolling 24h
    expect(snapshot.rolling24h).toEqual({
      throughput: 80,
      failures: 2,
      retries: 5,
      leaseLosses: 1,
      queueWaitP50Ms: 120,
      queueWaitP95Ms: 450,
      executionP50Ms: 2500,
      executionP95Ms: 5000,
    });
    expect(repo.getRolling24hMetrics).toHaveBeenCalledWith(
      new Date('2026-09-02T12:00:00.000Z'),
    );

    // Workers
    expect(snapshot.workers.activeCount).toBe(1);
    expect(snapshot.workers.staleCount).toBe(1);
    expect(snapshot.workers.stoppedCount).toBe(1);
    expect(snapshot.workers.instances).toEqual([
      {
        instanceId: 'worker-active-1',
        service: 'backtest-worker',
        startedAt: '2026-09-03T10:00:00.000Z',
        lastSeenAt: '2026-09-03T11:59:50.000Z',
        stoppedAt: null,
        status: 'active',
      },
      {
        instanceId: 'worker-stale-2',
        service: 'backtest-worker',
        startedAt: '2026-09-03T09:00:00.000Z',
        lastSeenAt: '2026-09-03T11:58:00.000Z',
        stoppedAt: null,
        status: 'stale',
      },
      {
        instanceId: 'worker-stopped-3',
        service: 'backtest-worker',
        startedAt: '2026-09-03T08:00:00.000Z',
        lastSeenAt: '2026-09-03T11:00:00.000Z',
        stoppedAt: '2026-09-03T11:00:00.000Z',
        status: 'stopped',
      },
    ]);

    // Outbox
    expect(snapshot.outbox.eligibleBacklog).toBe(12);
    expect(snapshot.outbox.oldestUnpublishedAgeMs).toBe(300_000);
    expect(snapshot.outbox.retryingCount).toBe(2);
    expect(snapshot.outbox.deadLetterCount).toBe(1);
    expect(snapshot.outbox.recentDeadLetters[0]?.lastError).toBe(
      'Failed with postgresql://user:[REDACTED]@localhost:5432/db',
    );

    // Recent Failures
    expect(snapshot.recentFailures).toHaveLength(1);
    expect(snapshot.recentFailures[0]).toEqual({
      jobId: 'job-1',
      experimentId: 'exp-1',
      workerId: 'worker-stale-2',
      retryCount: 3,
      failureCategory: 'TRANSIENT',
      failedAt: '2026-09-03T11:40:00.000Z',
      createdAt: '2026-09-03T11:30:00.000Z',
      errorSummary: 'Connection timed out with apiKey=[REDACTED]',
    });
  });

  it('handles null ages when there are no pending jobs or unpublished events', async () => {
    const repo = createMockRepo();
    repo.getJobStatusCounts = vi.fn().mockResolvedValue({
      counts: { PENDING: 0, CLAIMED: 0, COMPLETED: 10, FAILED: 0 },
      oldestPendingCreatedAt: null,
    });
    repo.getOutboxMetrics = vi.fn().mockResolvedValue({
      eligibleBacklog: 0,
      oldestUnpublishedCreatedAt: null,
      retryingCount: 0,
      deadLetterCount: 0,
      recentDeadLetters: [],
    });

    const service = new OperationsService(repo, { now: () => fixedNow });
    const snapshot = await service.getSnapshot();

    expect(snapshot.jobs.oldestPendingAgeMs).toBeNull();
    expect(snapshot.outbox.oldestUnpublishedAgeMs).toBeNull();
  });
});
