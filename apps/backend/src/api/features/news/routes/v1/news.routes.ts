import { Router } from 'express';
import type { NewsController } from '../../controllers/newsController';

export function createNewsFeatureRouter(
  newsController: NewsController,
): Router {
  const router = Router();

  router.get('/', newsController.getNewsList);
  router.get('/stats', newsController.getStats);
  router.get('/sources', newsController.getSources);
  router.get('/:id', newsController.getNewsById);

  return router;
}
