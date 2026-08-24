import { Request, Response, NextFunction } from 'express';
import { Role } from '@crypto-strategy-lab/shared';

export function authorizeRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (req.session.role !== role) {
      res.status(403).json({ error: 'Forbidden: Insufficient role' });
      return;
    }
    next();
  };
}
