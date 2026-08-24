import { Router } from 'express';

import {
  createHealthFeatureRouter,
  type HealthRepository,
} from '@/api/features/health';
import { createAuthFeatureRouter, AuthController } from '@/api/features/auth';
import { createAdminFeatureRouter } from '@/api/features/admin';
import type { AuthServiceInterface } from '@/api/features/auth';

export function createV1Router(
  healthRepository: HealthRepository,
  authService: AuthServiceInterface,
): Router {
  const router = Router();
  router.use('/health', createHealthFeatureRouter(healthRepository));
  router.use('/auth', createAuthFeatureRouter(new AuthController(authService)));
  router.use('/admin', createAdminFeatureRouter());
  return router;
}
