/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireAuth } from '@/api/middlewares/auth/requireAuth';
import { Request, Response, NextFunction } from 'express';

describe('requireAuth middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      session: {} as any,
      requestId: 'test-req-id',
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      req: req as any,
    };
    next = vi.fn();
  });

  it('returns 401 if session is missing', () => {
    req.session = undefined as any;
    requireAuth(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 if not authenticated', () => {
    requireAuth(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      requestId: 'test-req-id',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when a session userId is present', () => {
    req.session!.userId = '1';
    requireAuth(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
