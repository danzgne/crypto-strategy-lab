import { Router } from 'express';
import { Role } from '@crypto-strategy-lab/shared';
import { authorizeRole } from '@/api/middlewares/auth/authorizeRole';
import { AdminController } from '../../controllers/adminController';

export function createAdminFeatureRouter(
  adminController: AdminController,
): Router {
  const router = Router();

  // Apply admin role middleware to all routes in this router
  router.use(authorizeRole(Role.ADMIN));

  // 1. Configuring News Sources
  router.get('/news-sources', adminController.getNewsSources);
  router.post('/news-sources', adminController.createNewsSource);
  router.put('/news-sources/:id', adminController.updateNewsSource);
  router.delete('/news-sources/:id', adminController.deleteNewsSource);

  // 2. Starting a crawl
  router.post('/crawl/start', adminController.startCrawl);

  // 3. Setting the crawl refresh interval
  router.get('/crawl/interval', adminController.getCrawlInterval);
  router.put('/crawl/interval', adminController.updateCrawlInterval);

  // 4. Toggling extraction-template drift detection (Seam for #46)
  router.post(
    '/templates/drift-detection',
    adminController.toggleDriftDetection,
  );

  // 5. Applying a proposed template version (Seam for #46)
  router.post('/templates/apply', adminController.applyTemplate);

  // 6. HTML paste ingest
  router.post('/ingest/html', adminController.ingestHtml);

  return router;
}
