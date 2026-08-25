import { Router } from 'express';

import { HealthController } from '@/api/features/health/controllers/healthController';
import type { HealthRepository } from '@/api/features/health/repositories/interfaces/healthRepository.interface';
import { createHealthRouter } from '@/api/features/health/routes/v1/health.routes';
import { HealthService } from '@/api/features/health/services/healthService';

export function createHealthFeatureRouter(
  repository: HealthRepository,
): Router {
  const service = new HealthService(repository);
  const controller = new HealthController(service);
  return createHealthRouter(controller);
}

export type { HealthRepository } from '@/api/features/health/repositories/interfaces/healthRepository.interface';
