import { Router } from 'express';

import {
  createHealthFeatureRouter,
  type HealthRepository,
} from '@/api/features/health';
import { createAuthFeatureRouter, AuthController } from '@/api/features/auth';
import {
  createAdminFeatureRouter,
  AdminController,
} from '@/api/features/admin';
import { createNewsFeatureRouter, NewsController } from '@/api/features/news';
import type { PasswordAuthServiceInterface } from '@/api/features/auth';
import type { NewsServiceInterface } from '@/api/features/news';
import {
  createStrategiesFeatureRouter,
  StrategyGenerationController,
  StrategyLibraryController,
  type StrategyGenerationService,
  type StrategyLibraryService,
} from '@/api/features/strategies';

export interface StrategiesRouterDependencies {
  generationService: StrategyGenerationService;
  libraryService: StrategyLibraryService;
}

export function createV1Router(
  healthRepository: HealthRepository,
  authService: PasswordAuthServiceInterface,
  newsService?: NewsServiceInterface,
  strategies?: StrategiesRouterDependencies,
): Router {
  const router = Router();
  router.use('/health', createHealthFeatureRouter(healthRepository));
  router.use('/auth', createAuthFeatureRouter(new AuthController(authService)));

  if (newsService) {
    const adminController = new AdminController(newsService);
    router.use('/admin', createAdminFeatureRouter(adminController));

    const newsController = new NewsController(newsService);
    router.use('/news', createNewsFeatureRouter(newsController));
  }

  if (strategies) {
    const generationController = new StrategyGenerationController(
      strategies.generationService,
    );
    const libraryController = new StrategyLibraryController(
      strategies.libraryService,
    );
    router.use(
      '/strategies',
      createStrategiesFeatureRouter(generationController, libraryController),
    );
  }

  return router;
}
