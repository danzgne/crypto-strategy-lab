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
import {
  createNewsFeatureRouter,
  NewsController,
  ExtractionTemplateController,
} from '@/api/features/news';
import type { PasswordAuthServiceInterface } from '@/api/features/auth';
import type {
  NewsServiceInterface,
  ExtractionTemplateService,
} from '@/api/features/news';
import {
  createStrategiesFeatureRouter,
  StrategyGenerationController,
  StrategyLibraryController,
  type StrategyGenerationService,
  type StrategyLibraryService,
} from '@/api/features/strategies';
import {
  BacktestController,
  createBacktestFeatureRouter,
  type BacktestServiceInterface,
} from '@/api/features/backtests';
import {
  createLeaderboardFeatureRouter,
  LeaderboardController,
  type LeaderboardServiceInterface,
} from '@/api/features/leaderboard';
import {
  createSearchFeatureRouter,
  SearchController,
} from '@/api/features/search';

export interface StrategiesRouterDependencies {
  generationService: StrategyGenerationService;
  libraryService: StrategyLibraryService;
}

export function createV1Router(
  healthRepository: HealthRepository,
  authService: PasswordAuthServiceInterface,
  newsService?: NewsServiceInterface,
  strategies?: StrategiesRouterDependencies,
  backtestService?: BacktestServiceInterface,
  leaderboardService?: LeaderboardServiceInterface,
  searchController?: SearchController,
  extractionTemplateService?: ExtractionTemplateService,
): Router {
  const router = Router();
  router.use('/health', createHealthFeatureRouter(healthRepository));
  router.use('/auth', createAuthFeatureRouter(new AuthController(authService)));

  if (newsService) {
    const extractionTemplateController = extractionTemplateService
      ? new ExtractionTemplateController(newsService, extractionTemplateService)
      : undefined;

    const adminController = new AdminController(newsService);
    router.use(
      '/admin',
      createAdminFeatureRouter(adminController, extractionTemplateController),
    );

    const newsController = new NewsController(newsService);
    router.use(
      '/news',
      createNewsFeatureRouter(newsController, extractionTemplateController),
    );
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
  if (backtestService !== undefined) {
    router.use(
      '/backtests',
      createBacktestFeatureRouter(new BacktestController(backtestService)),
    );
  }
  if (leaderboardService !== undefined) {
    router.use(
      '/leaderboard',
      createLeaderboardFeatureRouter(
        new LeaderboardController(leaderboardService),
      ),
    );
  }
  if (searchController !== undefined) {
    router.use('/search', createSearchFeatureRouter(searchController));
  }
  return router;
}
