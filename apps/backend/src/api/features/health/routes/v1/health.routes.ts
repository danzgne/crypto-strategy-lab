import { Router } from 'express';

import type { HealthController } from '@/api/features/health/controllers/healthController';

export function createHealthRouter(controller: HealthController): Router {
  const router = Router();
  router.get('/', controller.liveness);
  router.get('/ready', controller.readiness);
  return router;
}
