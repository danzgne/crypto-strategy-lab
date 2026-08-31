import { createServer } from 'node:http';

import { config as loadEnvironment } from 'dotenv';
import '@crypto-strategy-lab/strategy-engine/strategies';

import { BinanceAdapter } from '@/api/features/marketData/adapters/binance/binanceAdapter';
import { FallbackLlmJsonProvider } from '@/llm/fallbackLlmJsonProvider';
import { GeminiJsonProvider } from '@/llm/geminiJsonProvider';
import { GroqJsonProvider } from '@/llm/groqJsonProvider';
import { MarketDataService } from '@/api/features/marketData/application/services/marketDataService';
import { MarketTickService } from '@/api/features/marketData/application/services/marketTickService';
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
import { StrategyLiveService } from '@/api/features/strategies/services/strategyLiveService';
import {
  PrismaStrategyLibraryRepository,
  StrategyGenerationService,
  StrategyLibraryService,
} from '@/api/features/strategies';
import {
  PrismaNewsRepository,
  NewsCrawler,
  NewsScheduler,
  NewsService,
} from '@/api/features/news';

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
  const eventBus = new InMemoryDomainEventBus();
  const healthRepository = new PrismaHealthRepository(prisma);
  const healthService = new HealthService(healthRepository);
  const exchangeAdapter = new BinanceAdapter();
  const geminiJsonProvider = new GeminiJsonProvider({
    apiKey: config.geminiApiKey,
    logger,
  });
  const groqJsonProvider = new GroqJsonProvider({
    apiKey: config.groqApiKey,
    logger,
  });
  const strategyGenerationLlmProvider = new FallbackLlmJsonProvider({
    providers: [groqJsonProvider, geminiJsonProvider],
    logger,
  });
  const sentimentAndExtractionLlmProvider = new FallbackLlmJsonProvider({
    providers: [geminiJsonProvider, groqJsonProvider],
    logger,
  });
  logger.info(
    {
      strategyGeneration:
        strategyGenerationLlmProvider.getAvailability('startup'),
      sentimentAndExtraction:
        sentimentAndExtractionLlmProvider.getAvailability('startup'),
    },
    'LLM JSON providers configured',
  );
  const marketDataService = new MarketDataService({
    exchangeAdapter,
    candleRepository: new PrismaCandleRepository(prisma),
    eventPublisher: eventBus,
    logger,
  });
  const marketTickService = new MarketTickService({
    exchangeAdapter,
    logger,
  });
  const strategyLiveService = new StrategyLiveService({
    eventBus,
    marketDataService,
  });
  const strategyGenerationService = new StrategyGenerationService({
    llmProvider: strategyGenerationLlmProvider,
    logger,
  });
  const strategyLibraryService = new StrategyLibraryService({
    repository: new PrismaStrategyLibraryRepository(prisma),
  });

  const authRepository = new PrismaAuthRepository(prisma);
  const authService = new PasswordAuthService(authRepository);

  const newsRepository = new PrismaNewsRepository(prisma);
  const newsCrawler = new NewsCrawler({
    newsRepository,
    eventPublisher: eventBus,
    logger,
  });
  const newsScheduler = new NewsScheduler({
    crawler: newsCrawler,
    logger,
    initialIntervalMinutes: 3,
    autoStart: true,
  });
  const newsService = new NewsService({
    newsRepository,
    crawler: newsCrawler,
    scheduler: newsScheduler,
  });

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

  await newsService.init?.();
  await newsService.ensureDefaultSources();
  void newsService.triggerCrawlNow().catch((err: unknown) => {
    logger.error({ err }, 'Initial background news crawl encountered an error');
  });

  const app = createApp({
    healthRepository,
    authService,
    newsService,
    strategies: {
      generationService: strategyGenerationService,
      libraryService: strategyLibraryService,
    },
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
    marketDataSource: 'Binance API + WebSocket',
    marketTickService,
    strategyLiveService,
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

    newsScheduler.stop();
    await strategyLiveService.close();
    await marketDataService.close();
    await marketTickService.close();
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
