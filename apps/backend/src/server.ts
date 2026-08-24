import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { AuthProvider } from '@crypto-strategy-lab/shared';

import type { HealthRepository } from './api/features/health';
import { createErrorHandler } from './api/middlewares/handlers/errorHandler';
import { notFoundHandler } from './api/middlewares/handlers/notFoundHandler';
import { requestLogger } from './api/middlewares/logging/requestLogger';
import { requestId } from './api/middlewares/requestId/requestId';
import { createV1Router } from './api/routes/v1';
import { createAppLogger, type AppLogger } from './utils/logger';

interface AppDependencies {
  healthRepository: HealthRepository;
  authProvider: AuthProvider;
  sessionMiddleware: express.RequestHandler;
  allowedOrigin?: string;
  logger?: AppLogger;
}

export function createApp({
  healthRepository,
  authProvider,
  sessionMiddleware,
  allowedOrigin = 'http://localhost:3000',
  logger = createAppLogger({ service: 'backend-test', enabled: false }),
}: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: allowedOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(requestId);
  app.use(requestLogger(logger));
  app.use(sessionMiddleware);
  app.use('/api/v1', createV1Router(healthRepository, authProvider));
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
