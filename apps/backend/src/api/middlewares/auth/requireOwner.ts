import { Request, Response, NextFunction } from 'express';
import { sendError } from '@/utils/response/ApiResponse';

/**
 * Placeholder middleware for resource ownership checks.
 *
 * **Status**: Intentional placeholder. This middleware currently only verifies
 * that the user is authenticated — it does NOT query the database to confirm
 * that the target resource belongs to the requesting user.
 *
 * **When to implement**: The first feature ticket that needs a real ownership
 * guard (e.g. updating/deleting a StrategyDefinition, Experiment, or
 * BacktestJob) should implement the database lookup here. At that point:
 *
 * 1. Accept the Prisma client (or a repository) as a dependency.
 * 2. Look up the resource by `req.params[paramName]`.
 * 3. Compare `resource.ownerId` with `req.session.userId`.
 * 4. Return 403 if they don't match.
 *
 * Until then, ownership scoping is enforced at the query level
 * (`WHERE ownerId = currentUser`) in each repository, which is sufficient
 * for read paths.
 */
export function requireOwner(_paramName: string = 'id') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session || !req.session.userId) {
      sendError(
        res,
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        401,
      );
      return;
    }

    // TODO(ownership): Implement database lookup when the first feature
    // that mutates a user-owned resource is built. See docstring above.

    next();
  };
}
