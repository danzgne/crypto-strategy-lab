import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import type { HealthRepository } from '@/api/features/health';
import type { PasswordAuthServiceInterface } from '@/api/features/auth';
import type { NewsServiceInterface } from '@/api/features/news';
import type { BacktestServiceInterface } from '@/api/features/backtests';
import type { LeaderboardServiceInterface } from '@/api/features/leaderboard';
import type { SearchController } from '@/api/features/search';
import { createErrorHandler } from '@/api/middlewares/handlers/errorHandler';
import { notFoundHandler } from '@/api/middlewares/handlers/notFoundHandler';
import { requestLogger } from '@/api/middlewares/logging/requestLogger';
import { requestId } from '@/api/middlewares/requestId/requestId';
import {
  createV1Router,
  type StrategiesRouterDependencies,
} from '@/api/routes/v1';
import { createAppLogger, type AppLogger } from '@/utils/logger';

interface AppDependencies {
  healthRepository: HealthRepository;
  authService: PasswordAuthServiceInterface;
  newsService?: NewsServiceInterface;
  strategies?: StrategiesRouterDependencies;
  sessionMiddleware: express.RequestHandler;
  allowedOrigin?: string;
  logger?: AppLogger;
  backtestService?: BacktestServiceInterface;
  leaderboardService?: LeaderboardServiceInterface;
  searchController?: SearchController;
}

export function createApp({
  healthRepository,
  authService,
  newsService,
  strategies,
  sessionMiddleware,
  allowedOrigin = 'http://localhost:3000',
  logger = createAppLogger({ service: 'backend-test', enabled: false }),
  backtestService,
  leaderboardService,
  searchController,
}: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: allowedOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(requestId);
  app.use(requestLogger(logger));
  app.use(sessionMiddleware);
  app.use(
    '/api/v1',
    createV1Router(
      healthRepository,
      authService,
      newsService,
      strategies,
      backtestService,
      leaderboardService,
      searchController,
    ),
  );
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
