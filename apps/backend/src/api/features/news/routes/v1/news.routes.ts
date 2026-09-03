import { Router } from 'express';
import type { NewsController } from '../../controllers/newsController';
import type { ExtractionTemplateController } from '../../controllers/extractionTemplateController';

export function createNewsFeatureRouter(
  newsController: NewsController,
  extractionTemplateController?: ExtractionTemplateController,
): Router {
  const router = Router();

  router.get('/', newsController.getNewsList);
  router.get('/stats', newsController.getStats);
  router.get('/sources', newsController.getSources);
  router.get('/interval', newsController.getCrawlInterval);

  if (extractionTemplateController) {
    router.get(
      '/extraction/settings',
      extractionTemplateController.getSettings,
    );
    router.get(
      '/sources/:id/extraction-panel',
      extractionTemplateController.getPanelData,
    );
    router.get(
      '/sources/:id/template/versions',
      extractionTemplateController.listVersions,
    );
  }

  router.get('/:id', newsController.getNewsById);

  return router;
}
