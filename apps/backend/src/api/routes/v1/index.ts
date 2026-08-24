import { Router } from 'express';
import { AuthProvider } from '@crypto-strategy-lab/shared';

import {
  createHealthFeatureRouter,
  type HealthRepository,
} from '../../features/health';
import { createAuthRouter } from '../../auth.routes';
import { createAdminRouter } from '../../admin.routes';

export function createV1Router(
  healthRepository: HealthRepository,
  authProvider: AuthProvider,
): Router {
  const router = Router();
  router.use('/health', createHealthFeatureRouter(healthRepository));
  router.use('/auth', createAuthRouter(authProvider));
  router.use('/admin', createAdminRouter());
  return router;
}
