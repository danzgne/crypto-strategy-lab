import { Router, Request, Response, NextFunction } from 'express';
import { Role } from '@crypto-strategy-lab/shared';

export function requireRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (req.session.role !== role) {
      return res.status(403).json({ error: 'Forbidden: Insufficient role' });
    }
    next();
  };
}

export function createAdminRouter() {
  const router = Router();

  // Apply admin role middleware to all routes in this router
  router.use(requireRole(Role.ADMIN));

  // 1. Configuring News Sources
  router.post('/news-sources', (req, res) => {
    res.json({ message: 'News sources configured' });
  });

  // 2. Starting a crawl
  router.post('/crawl/start', (req, res) => {
    res.json({ message: 'Crawl started' });
  });

  // 3. Setting the crawl refresh interval
  router.put('/crawl/interval', (req, res) => {
    res.json({ message: 'Crawl interval updated' });
  });

  // 4. Toggling extraction-template drift detection
  router.post('/templates/drift-detection', (req, res) => {
    res.json({ message: 'Drift detection toggled' });
  });

  // 5. Applying a proposed template version
  router.post('/templates/apply', (req, res) => {
    res.json({ message: 'Template applied' });
  });

  // 6. HTML paste ingest
  router.post('/ingest/html', (req, res) => {
    res.json({ message: 'HTML ingested' });
  });

  return router;
}
