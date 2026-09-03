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
import { PrismaOutboxDispatcher } from '@/events/prismaOutboxDispatcher';
import { createSessionMiddleware } from '@/api/middlewares/auth/session';
import { PrismaAuthRepository, PasswordAuthService } from '@/api/features/auth';
import { StrategyLiveService } from '@/api/features/strategies/services/strategyLiveService';
import {
  PrismaStrategyLibraryRepository,
  StrategyGenerationService,
  StrategyLibraryService,
} from '@/api/features/strategies';
import {
  OperationsService,
  PrismaOperationsRepository,
} from '@/api/features/admin';
import {
  PrismaNewsRepository,
  PrismaExtractionTemplateRepository,
  NewsCrawler,
  NewsScheduler,
  NewsService,
  SentimentScoringService,
  ExtractionTemplateService,
  RssNewsProvider,
  HtmlPasteNewsProvider,
  WebsiteNewsProvider,
} from '@/api/features/news';
import {
  BacktestService,
  PrismaBacktestRepository,
} from '@/api/features/backtests';
import {
  PrismaLeaderboardRepository,
  RankingService,
} from '@/api/features/leaderboard';
import {
  SearchCoordinator,
  SearchScheduler,
  TradeRetentionService,
  SearchController,
} from '@/api/features/search';
import type { DiscoveryProgressPayload } from '@crypto-strategy-lab/shared';

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
  const outboxDispatcher = new PrismaOutboxDispatcher(prisma, eventBus, logger);
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
  const newsRepository = new PrismaNewsRepository(prisma);
  const sentimentScoringService = new SentimentScoringService({
    repository: newsRepository,
    llmProvider: sentimentAndExtractionLlmProvider,
    eventPublisher: eventBus,
    logger,
  });
  const unsubscribeFromNewsCollected = eventBus.subscribe('NewsCollected', () =>
    sentimentScoringService.schedulePass(),
  );

  const extractionTemplateService = new ExtractionTemplateService({
    templateRepository: new PrismaExtractionTemplateRepository(prisma),
    sourceLookup: newsRepository,
    settingsStore: newsRepository,
    llmProvider: sentimentAndExtractionLlmProvider,
    logger,
  });
  const unsubscribeFromExtractionValidated = eventBus.subscribe(
    'ExtractionValidated',
    (event) =>
      extractionTemplateService.schedulePass(event.payload.newsSourceId),
  );
  const strategyLiveService = new StrategyLiveService({
    eventBus,
    marketDataService,
    sentimentAggregateReader: {
      getAggregate: async (pair) =>
        (await newsRepository.getNewsAnalytics(pair)).aggregate,
    },
    logger,
  });
  const strategyGenerationService = new StrategyGenerationService({
    llmProvider: strategyGenerationLlmProvider,
    logger,
  });
  const strategyLibraryService = new StrategyLibraryService({
    repository: new PrismaStrategyLibraryRepository(prisma),
  });
  const backtestService = new BacktestService({
    historyProvider: marketDataService,
    maxSelectedCandles: config.maxBacktestCandles,
    repository: new PrismaBacktestRepository(prisma),
    logger,
  });
  const leaderboardService = new RankingService({
    eventBus,
    repository: new PrismaLeaderboardRepository(prisma, config.leaderboardTopK),
    topK: config.leaderboardTopK,
  });

  const authRepository = new PrismaAuthRepository(prisma);
  const authService = new PasswordAuthService(authRepository);

  const htmlPasteProvider = new HtmlPasteNewsProvider();
  const newsCrawler = new NewsCrawler({
    newsRepository,
    eventPublisher: eventBus,
    logger,
    htmlPasteProvider,
    providers: [
      new RssNewsProvider(),
      htmlPasteProvider,
      new WebsiteNewsProvider({ templatePort: extractionTemplateService }),
    ],
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

  const searchSchedulerRef: { current?: SearchScheduler } = {};

  const searchCoordinator = new SearchCoordinator({
    eventBus,
    historyProvider: marketDataService,
    logger,
    onProgress: (event) => {
      searchSchedulerRef.current?.handleCoordinatorProgress(event);
    },
    prisma,
  });

  const tradeRetentionService = new TradeRetentionService(prisma);

  let discoveryGatewayEmitter:
    ((progress: DiscoveryProgressPayload) => void) | undefined;

  const searchScheduler = new SearchScheduler({
    coordinator: searchCoordinator,
    logger,
    onProgress: (progress) => {
      discoveryGatewayEmitter?.(progress);
    },
    perUserMaxInFlight: 5,
    prisma,
    tradeRetentionService,
  });
  searchSchedulerRef.current = searchScheduler;

  const searchController = new SearchController(
    searchScheduler,
    tradeRetentionService,
  );

  await prisma.$connect();
  await backtestService.start();
  await leaderboardService.start();
  await searchCoordinator.start();
  await searchScheduler.start();
  outboxDispatcher.start();
  await healthService.recordStarted(config.instanceId);

  const heartbeatIntervalMs = 10_000;
  const heartbeatTimer = setInterval(() => {
    void healthService
      .recordHeartbeat(config.instanceId)
      .catch((err: unknown) => {
        logger.warn({ err }, 'Failed to record backend heartbeat');
      });
  }, heartbeatIntervalMs);
  heartbeatTimer.unref();

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
  sentimentScoringService.schedulePass();
  void newsService.triggerCrawlNow().catch((err: unknown) => {
    logger.error({ err }, 'Initial background news crawl encountered an error');
  });

  const operationsRepository = new PrismaOperationsRepository(prisma);
  const operationsService = new OperationsService(operationsRepository);

  const app = createApp({
    allowedOrigin: config.frontendOrigin,
    authService,
    backtestService,
    extractionTemplateService,
    healthRepository,
    leaderboardService,
    logger,
    newsService,
    operationsService,
    searchController,
    sessionMiddleware,
    strategies: {
      generationService: strategyGenerationService,
      libraryService: strategyLibraryService,
    },
  });
  const httpServer = createServer(app);
  const socketServer = createSocketServer(httpServer, {
    allowedOrigin: config.frontendOrigin,
    leaderboardEventBus: eventBus,
    logger,
    marketDataService,
    marketDataSource: 'Configured exchange adapter',
    marketTickService,
    onDiscoveryGatewayRegistered: (emitter) => {
      discoveryGatewayEmitter = emitter;
    },
    sessionMiddleware,
    strategyLiveService,
    strategyLibraryService,
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

    clearInterval(heartbeatTimer);
    newsScheduler.stop();
    await searchScheduler.stop();
    await searchCoordinator.stop();
    await strategyLiveService.close();
    unsubscribeFromNewsCollected();
    await sentimentScoringService.close();
    unsubscribeFromExtractionValidated();
    await extractionTemplateService.close();
    outboxDispatcher.stop();
    leaderboardService.stop();
    await backtestService.stop();
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
