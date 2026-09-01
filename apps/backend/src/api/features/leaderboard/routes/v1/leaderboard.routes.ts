import { Router } from 'express';

import { requireOwner } from '@/api/middlewares/auth/requireOwner';
import { LeaderboardController } from '../../controllers/leaderboardController';

export function createLeaderboardFeatureRouter(
  controller: LeaderboardController,
): Router {
  const router = Router();
  router.use(requireOwner());
  router.get('/', controller.get);
  return router;
}
