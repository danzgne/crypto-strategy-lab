import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

export function requestId(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const incomingRequestId = request.header('x-request-id')?.trim();
  request.requestId = incomingRequestId || randomUUID();
  response.setHeader('x-request-id', request.requestId);
  next();
}
