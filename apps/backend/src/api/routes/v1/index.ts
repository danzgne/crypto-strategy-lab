import { Router } from 'express';

import {
  createHealthFeatureRouter,
  type HealthRepository,
} from '../../features/health';

export function createV1Router(healthRepository: HealthRepository): Router {
  const router = Router();
  router.use('/health', createHealthFeatureRouter(healthRepository));
  return router;
}
