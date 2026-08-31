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

export function createV1Router(
  healthRepository: HealthRepository,
  authService: PasswordAuthServiceInterface,
  newsService?: NewsServiceInterface,
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

  return router;
}
