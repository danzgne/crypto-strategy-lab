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
import {
  BacktestController,
  createBacktestFeatureRouter,
  type BacktestServiceInterface,
} from '@/api/features/backtests';
import {
  createStrategyLibraryFeatureRouter,
  type StrategyLibraryServiceInterface,
} from '@/api/features/strategies/library';
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
  strategyLibraryService?: StrategyLibraryServiceInterface,
  backtestService?: BacktestServiceInterface,
  leaderboardService?: LeaderboardServiceInterface,
  searchController?: SearchController,
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
  } else if (strategyLibraryService !== undefined) {
    router.use(
      '/strategies',
      createStrategyLibraryFeatureRouter(
        new StrategyLibraryController(strategyLibraryService),
      ),
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
