import { Request, Response, NextFunction } from 'express';
import { Role } from '@crypto-strategy-lab/shared';
import { sendError } from '@/utils/response/ApiResponse';

export function authorizeRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session || !req.session.userId) {
      sendError(
        res,
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        401,
      );
      return;
    }
    if (req.session.role !== role) {
      sendError(
        res,
        { code: 'FORBIDDEN', message: 'Forbidden: Insufficient role' },
        403,
      );
      return;
    }
    next();
  };
}
