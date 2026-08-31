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
  router.post('/', requireAuth, libraryController.create);
  router.get('/', requireAuth, libraryController.list);

  return router;
}
