import { Request, Response, NextFunction } from 'express';
import { sendError } from '@/utils/response/ApiResponse';

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.session || !req.session.userId) {
    sendError(res, { code: 'UNAUTHORIZED', message: 'Not authenticated' }, 401);
    return;
  }

  next();
}
