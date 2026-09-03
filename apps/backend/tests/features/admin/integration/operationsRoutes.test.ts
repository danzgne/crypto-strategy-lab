import type { OperationsSnapshot } from '@crypto-strategy-lab/shared';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import type { OperationsServiceInterface } from '@/api/features/admin';
import { createApp } from '@/server';

const mockSnapshot: OperationsSnapshot = {
  jobs: {
    countByStatus: {
      CLAIMED: 2,
      COMPLETED: 120,
      FAILED: 4,
      PENDING: 8,
    },
    oldestPendingAgeMs: 45000,
  },
  outbox: {
    deadLetterCount: 2,
    eligibleBacklog: 15,
    oldestUnpublishedAgeMs: 12000,
    recentDeadLetters: [
      {
        attemptCount: 8,
        deadLetteredAt: '2026-09-03T11:50:00.000Z',
        eventId: 'evt-123',
        id: 'dl-1',
        lastError: 'Sanitized error',
        name: 'StrategyEvaluated',
      },
    ],
    retryingCount: 3,
  },
  queriedAt: '2026-09-03T12:00:00.000Z',
  recentFailures: [
    {
      createdAt: '2026-09-03T11:00:00.000Z',
      errorSummary: 'Job execution timeout',
      experimentId: 'exp-1',
      failedAt: '2026-09-03T11:05:00.000Z',
      failureCategory: 'TRANSIENT',
      jobId: 'job-1',
      retryCount: 3,
      workerId: 'worker-1',
    },
  ],
  rolling24h: {
    executionP50Ms: 2100,
    executionP95Ms: 4800,
    failures: 4,
    leaseLosses: 1,
    queueWaitP50Ms: 150,
    queueWaitP95Ms: 500,
    retries: 7,
    throughput: 110,
  },
  workers: {
    activeCount: 2,
    instances: [
      {
        instanceId: 'worker-1',
        lastSeenAt: '2026-09-03T11:59:55.000Z',
        service: 'backtest-worker',
        startedAt: '2026-09-03T10:00:00.000Z',
        status: 'active',
        stoppedAt: null,
      },
    ],
    staleCount: 0,
    stoppedCount: 0,
  },
};

describe('Operations routes integration', () => {
  it('returns 401 when request is unauthenticated', async () => {
    const app = createApp({
      authService:
        {} as unknown as import('@/api/features/auth').PasswordAuthServiceInterface,
      healthRepository:
        {} as unknown as import('@/api/features/health').HealthRepository,
      operationsService: {
        getSnapshot: vi.fn().mockResolvedValue(mockSnapshot),
      },
      sessionMiddleware: (_req, _res, next) => next(),
    });

    const response = await request(app).get('/api/v1/admin/operations');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: { code: 'UNAUTHORIZED' },
      success: false,
    });
  });

  it('returns 403 when authenticated user is not an admin', async () => {
    const app = createApp({
      authService:
        {} as unknown as import('@/api/features/auth').PasswordAuthServiceInterface,
      healthRepository:
        {} as unknown as import('@/api/features/health').HealthRepository,
      operationsService: {
        getSnapshot: vi.fn().mockResolvedValue(mockSnapshot),
      },
      sessionMiddleware: (req, _res, next) => {
        req.session = {
          role: 'USER',
          userId: 'regular-user-id',
        } as typeof req.session;
        next();
      },
    });

    const response = await request(app).get('/api/v1/admin/operations');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: { code: 'FORBIDDEN' },
      success: false,
    });
  });

  it('returns 200 with full operations snapshot when authenticated as admin', async () => {
    const mockService: OperationsServiceInterface = {
      getSnapshot: vi.fn().mockResolvedValue(mockSnapshot),
    };

    const app = createApp({
      authService:
        {} as unknown as import('@/api/features/auth').PasswordAuthServiceInterface,
      healthRepository:
        {} as unknown as import('@/api/features/health').HealthRepository,
      operationsService: mockService,
      sessionMiddleware: (req, _res, next) => {
        req.session = {
          role: 'ADMIN',
          userId: 'admin-user-id',
        } as typeof req.session;
        next();
      },
    });

    const response = await request(app).get('/api/v1/admin/operations');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual(mockSnapshot);
    expect(mockService.getSnapshot).toHaveBeenCalledTimes(1);
  });
});
