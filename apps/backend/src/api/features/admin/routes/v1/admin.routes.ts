import { Router } from 'express';
import { Role } from '@crypto-strategy-lab/shared';
import { authorizeRole } from '@/api/middlewares/auth/authorizeRole';
import { AdminController } from '../../controllers/adminController';
import type { ExtractionTemplateController } from '@/api/features/news/controllers/extractionTemplateController';

export function createAdminFeatureRouter(
  adminController: AdminController,
  extractionTemplateController?: ExtractionTemplateController,
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

  // 4. HTML paste ingest
  router.post('/ingest/html', adminController.ingestHtml);

  // 5. Extraction Templates: authoring bench, versions, and drift settings
  if (extractionTemplateController) {
    router.post(
      '/news-sources/:id/template/preview',
      extractionTemplateController.preview,
    );
    router.post(
      '/news-sources/:id/template/generate',
      extractionTemplateController.generate,
    );
    router.post(
      '/news-sources/:id/template/versions',
      extractionTemplateController.saveProposedVersion,
    );
    router.post(
      '/news-sources/:id/template/versions/:versionId/activate',
      extractionTemplateController.activateVersion,
    );
    router.post(
      '/news-sources/:id/template/versions/:versionId/reject',
      extractionTemplateController.rejectVersion,
    );
    router.put(
      '/extraction/settings',
      extractionTemplateController.updateSettings,
    );
  }

  return router;
}
