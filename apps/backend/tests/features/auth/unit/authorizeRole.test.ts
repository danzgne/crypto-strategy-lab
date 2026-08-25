/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authorizeRole } from '@/api/middlewares/auth/authorizeRole';
import { Request, Response, NextFunction } from 'express';
import { Role } from '@crypto-strategy-lab/shared';

describe('authorizeRole middleware', () => {
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

  it('should return 401 if not authenticated', () => {
    const middleware = authorizeRole('ADMIN' as Role);
    middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      requestId: 'test-req-id',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 if role is insufficient', () => {
    req.session!.userId = '1';
    req.session!.role = 'USER' as Role;
    const middleware = authorizeRole('ADMIN' as Role);

    middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Forbidden: Insufficient role' },
      requestId: 'test-req-id',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next if authenticated and role matches', () => {
    req.session!.userId = '1';
    req.session!.role = 'ADMIN' as Role;
    const middleware = authorizeRole('ADMIN' as Role);

    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
