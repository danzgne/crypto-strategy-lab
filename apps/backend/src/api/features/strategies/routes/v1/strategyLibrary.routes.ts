import { Router } from 'express';

import { requireOwner } from '@/api/middlewares/auth/requireOwner';
import { StrategyLibraryController } from '../../controllers/strategyLibraryController';

export function createStrategyLibraryFeatureRouter(
  controller: StrategyLibraryController,
): Router {
  const router = Router();
  router.use(requireOwner());
  router.get('/', controller.list);
  router.post('/', controller.create);
  return router;
}
