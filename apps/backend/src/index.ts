import { createServer } from 'node:http';

import { config as loadEnvironment } from 'dotenv';

import { BinanceAdapter } from '@/api/features/marketData/adapters/binance/binanceAdapter';
import { MarketDataService } from '@/api/features/marketData/application/services/marketDataService';
import { PrismaCandleRepository } from '@/api/features/marketData/repositories/prismaCandleRepository';
import { PrismaHealthRepository } from '@/api/features/health/repositories/prismaHealthRepository';
import { HealthService } from '@/api/features/health/services/healthService';
import { readAppConfig } from '@/config/appConfig';
import { createPrismaClient } from '@/database/prismaClient';
import { createSocketServer } from '@/realtime/socketServer';
import { createApp } from '@/server';
import { createAppLogger } from '@/utils/logger';
import { InMemoryDomainEventBus } from '@/events/inMemoryDomainEventBus';
import { createSessionMiddleware } from '@/api/middlewares/auth/session';
import { PrismaAuthRepository, PasswordAuthService } from '@/api/features/auth';

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
  const marketDataService = new MarketDataService({
    exchangeAdapter: new BinanceAdapter(),
    candleRepository: new PrismaCandleRepository(prisma),
    eventPublisher: new InMemoryDomainEventBus(),
    logger,
  });

  const authRepository = new PrismaAuthRepository(prisma);
  const authService = new PasswordAuthService(authRepository);

  await prisma.$connect();
  await healthService.recordStarted(config.instanceId);

  const sessionMiddleware = createSessionMiddleware(prisma, {
    secret: config.sessionSecret,
    secureCookie: config.secureCookie,
  });

  const adminEmail = config.adminEmail;
  if (adminEmail) {
    const promoted = await authService.ensureAdmin(
      adminEmail,
      config.adminDefaultPassword!,
    );
    if (promoted) {
      logger.info({ email: adminEmail }, 'Promoted user to ADMIN role');
    }
  }

  const app = createApp({
    healthRepository,
    authService,
    sessionMiddleware,
    allowedOrigin: config.frontendOrigin,
    logger,
  });
  const httpServer = createServer(app);
  const socketServer = createSocketServer(httpServer, {
    allowedOrigin: config.frontendOrigin,
    sessionMiddleware,
    logger,
    marketDataService,
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

    await marketDataService.close();
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
  bootstrapLogger.fatal({ err: error }, 'Backend failed to start');
  bootstrapLogger.flush();
  process.exitCode = 1;
});
