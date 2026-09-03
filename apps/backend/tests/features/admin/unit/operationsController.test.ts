import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

import { OperationsController } from '@/api/features/admin/controllers/operationsController';
import type { OperationsServiceInterface } from '@/api/features/admin/services/interfaces/operationsService.interface';
import type { OperationsSnapshot } from '@crypto-strategy-lab/shared';

function createMockResponse(): Response {
  const res = {
    req: { requestId: 'test-req-id' },
  } as unknown as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res;
}

describe('OperationsController', () => {
  const mockSnapshot: OperationsSnapshot = {
    jobs: {
      countByStatus: {
        CLAIMED: 1,
        COMPLETED: 50,
        FAILED: 2,
        PENDING: 3,
      },
      oldestPendingAgeMs: 12000,
    },
    outbox: {
      deadLetterCount: 0,
      eligibleBacklog: 5,
      oldestUnpublishedAgeMs: 3000,
      recentDeadLetters: [],
      retryingCount: 1,
    },
    queriedAt: '2026-09-03T12:00:00.000Z',
    recentFailures: [],
    rolling24h: {
      executionP50Ms: 1500,
      executionP95Ms: 3000,
      failures: 2,
      leaseLosses: 0,
      queueWaitP50Ms: 100,
      queueWaitP95Ms: 250,
      retries: 3,
      throughput: 48,
    },
    workers: {
      activeCount: 1,
      instances: [],
      staleCount: 0,
      stoppedCount: 0,
    },
  };

  it('handles getSnapshot successfully and sends 200', async () => {
    const mockService = {
      getSnapshot: vi.fn().mockResolvedValue(mockSnapshot),
    } as unknown as OperationsServiceInterface;

    const controller = new OperationsController(mockService);
    const req = {} as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    await controller.getSnapshot(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate',
    );
    expect(res.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
    expect(res.setHeader).toHaveBeenCalledWith('Expires', '0');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: mockSnapshot,
        requestId: 'test-req-id',
        success: true,
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards errors to next function on failure', async () => {
    const error = new Error('Database connection failed');
    const mockService = {
      getSnapshot: vi.fn().mockRejectedValue(error),
    } as unknown as OperationsServiceInterface;

    const controller = new OperationsController(mockService);
    const req = {} as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    await controller.getSnapshot(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
