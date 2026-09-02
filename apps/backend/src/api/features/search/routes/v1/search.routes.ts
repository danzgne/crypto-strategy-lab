import { Router } from 'express';
import { requireOwner } from '@/api/middlewares/auth/requireOwner';
import type { SearchController } from '../../controllers/searchController';

export function createSearchFeatureRouter(
  controller: SearchController,
): Router {
  const router = Router();
  router.use(requireOwner());

  router.post('/sessions', controller.startSession);
  router.get('/sessions/current', controller.getCurrentSession);
  router.post('/sessions/pause', controller.pauseSession);
  router.post('/sessions/resume', controller.resumeSession);
  router.post('/sessions/stop', controller.stopSession);
  router.get('/runs', controller.getHistoricalRuns);
  router.post('/experiments/:id/pin', controller.setExperimentPinned);

  return router;
}
