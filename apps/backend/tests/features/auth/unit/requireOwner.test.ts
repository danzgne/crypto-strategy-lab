/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireOwner } from '@/api/middlewares/auth/requireOwner';
import { Request, Response, NextFunction } from 'express';

describe('requireOwner middleware', () => {
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

  it('should return 401 if session is missing', () => {
    req.session = undefined as any;
    const middleware = requireOwner('id');
    middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 if not authenticated', () => {
    const middleware = requireOwner('id');
    middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      requestId: 'test-req-id',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next if authenticated (placeholder behavior)', () => {
    req.session!.userId = '1';
    const middleware = requireOwner('id');

    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
