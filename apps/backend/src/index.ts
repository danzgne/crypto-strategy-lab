import { createServer } from 'node:http';

import { config as loadEnvironment } from 'dotenv';

import { PrismaHealthRepository } from './api/features/health/repositories/prismaHealthRepository';
import { HealthService } from './api/features/health/services/healthService';
import { readAppConfig } from './config/appConfig';
import { createPrismaClient } from './database/prismaClient';
import { createSocketServer } from './realtime/socketServer';
import { createApp } from './server';
import { createAppLogger } from './utils/logger';

loadEnvironment({
  path: new URL('../../../.env', import.meta.url),
  quiet: true,
});

const bootstrapLogger = createAppLogger({ service: 'backend' });

async function startBackend(): Promise<void> {
  const config = readAppConfig();
  const logger = createAppLogger({
    service: 'backend',
    level: config.logLevel,
  });
  const prisma = createPrismaClient(config.databaseUrl);
  const healthRepository = new PrismaHealthRepository(prisma);
  const healthService = new HealthService(healthRepository);

  await prisma.$connect();
  await healthService.recordStarted(config.instanceId);

  const app = createApp({
    healthRepository,
    allowedOrigin: config.frontendOrigin,
    logger,
  });
  const httpServer = createServer(app);
  const socketServer = createSocketServer(httpServer, {
    allowedOrigin: config.frontendOrigin,
    logger,
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(config.port, config.host, () => {
      httpServer.off('error', reject);
      resolve();
    });
  });

  logger.info({ host: config.host, port: config.port }, 'Backend listening');

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Backend shutdown started');

    await socketServer.close();
    if (httpServer.listening) {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await healthService.recordStopped(config.instanceId);
    await prisma.$disconnect();
    logger.info('Backend shutdown complete');
    logger.flush();
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

void startBackend().catch((error: unknown) => {
  bootstrapLogger.fatal({ error }, 'Backend failed to start');
  bootstrapLogger.flush();
  process.exitCode = 1;
});
