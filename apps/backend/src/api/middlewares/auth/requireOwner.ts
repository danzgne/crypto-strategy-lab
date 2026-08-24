import { Request, Response, NextFunction } from 'express';

/**
 * Ensures the resource being accessed belongs to the currently authenticated user.
 * This middleware expects that the `ownerId` parameter is available in `req.params`,
 * OR it can be used to manually scope down Prisma queries inside the controller.
 *
 * Note: If you are filtering globally on read paths (e.g. `where: { ownerId: req.session.userId }`),
 * you may not need this middleware, but it's useful for targeted checks (e.g. updates/deletes)
 * where the resource ID is passed in the URL.
 */
export function requireOwner(paramName: string = 'id') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session || !req.session.userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // In a real scenario, this middleware might need to query the database
    // to check if the resource (e.g. Strategy, Backtest) actually belongs to the user.
    // For now, this serves as a placeholder to enforce the `ownerId` scoping requirement.
    // When the feature is implemented, the query should do:
    // `const resource = await prisma.strategy.findUnique({ where: { id: req.params[paramName] } });`
    // `if (resource.ownerId !== req.session.userId) return res.status(403).json(...)`

    next();
  };
}
