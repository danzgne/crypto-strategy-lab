import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { createErrorHandler } from '@/api/middlewares/handlers/errorHandler';
import type { AppLogger } from '@/utils/logger';

describe('errorHandler structured logging', () => {
  it('passes unexpected failures through Pino standard error serialization', () => {
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
    } as unknown as AppLogger;
    const request = { requestId: 'request-27' } as Request;
    const response = {
      req: request,
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const failure = new Error('database unavailable');
    const handler = createErrorHandler(logger);

    handler(failure, request, response, vi.fn() as NextFunction);

    expect(logger.error).toHaveBeenCalledWith(
      { err: failure, requestId: 'request-27' },
      'Request failed unexpectedly',
    );
  });
});
