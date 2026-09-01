import { Router } from 'express';

import { requireAuth } from '@/api/middlewares/auth/requireAuth';

import type { StrategyGenerationController } from '../../controllers/strategyGenerationController';
import type { StrategyLibraryController } from '../../controllers/strategyLibraryController';

export function createStrategiesFeatureRouter(
  generationController: StrategyGenerationController,
  libraryController: StrategyLibraryController,
): Router {
  const router = Router();

  router.post('/generate', requireAuth, generationController.generate);
  router.post('/validate', requireAuth, libraryController.validate);
  router.get('/', requireAuth, libraryController.list);
  router.post('/', requireAuth, libraryController.create);
  router.get('/:id', requireAuth, libraryController.get);
  router.patch('/:id', requireAuth, libraryController.updateMetadata);
  router.post('/:id/versions', requireAuth, libraryController.addVersion);
  router.patch('/:id/archive', requireAuth, libraryController.archive);

  return router;
}
