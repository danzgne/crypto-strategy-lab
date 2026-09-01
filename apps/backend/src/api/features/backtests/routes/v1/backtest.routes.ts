import { Router } from 'express';

import { requireOwner } from '@/api/middlewares/auth/requireOwner';
import { BacktestController } from '../../controllers/backtestController';

export function createBacktestFeatureRouter(
  controller: BacktestController,
): Router {
  const router = Router();
  router.use(requireOwner());
  router.post('/', controller.create);
  router.get('/:experimentId', controller.get);
  return router;
}
