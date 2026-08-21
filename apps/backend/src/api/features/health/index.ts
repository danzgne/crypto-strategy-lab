import { Router } from 'express';

import { HealthController } from './controllers/healthController';
import type { HealthRepository } from './repositories/interfaces/healthRepository.interface';
import { createHealthRouter } from './routes/v1/health.routes';
import { HealthService } from './services/healthService';

export function createHealthFeatureRouter(
  repository: HealthRepository,
): Router {
  const service = new HealthService(repository);
  const controller = new HealthController(service);
  return createHealthRouter(controller);
}

export type { HealthRepository } from './repositories/interfaces/healthRepository.interface';
