import { createServer } from 'node:http';

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@crypto-strategy-lab/shared';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ExchangeAdapter } from '@/api/features/marketData/application/interfaces/exchangeAdapter.interface';
import { MarketDataService } from '@/api/features/marketData/application/services/marketDataService';
import { StrategyLiveService } from '@/api/features/strategies/services/strategyLiveService';
import { StrategyLibraryService } from '@/api/features/strategies/services/strategyLibraryService';
import { PrismaStrategyLibraryRepository } from '@/api/features/strategies/repositories/prismaStrategyLibraryRepository';
import { PrismaAuthRepository, PasswordAuthService } from '@/api/features/auth';
import { createPrismaClient } from '@/database/prismaClient';
import { InMemoryDomainEventBus } from '@/events/inMemoryDomainEventBus';
import { createSocketServer } from '@/realtime/socketServer';
import { PrismaClient } from '../../../../../../generated/prisma/client';

describe('strategy realtime gateway', () => {
  const closeCallbacks: Array<() => Promise<void>> = [];
  let prisma: PrismaClient;
  let ownerId: string;
  let otherOwnerId: string;

  beforeAll(async () => {
    prisma = createPrismaClient(
      process.env.DATABASE_URL ||
        'postgresql://crypto_lab:crypto_lab@localhost:5434/crypto_strategy_lab?schema=public',
    );
    await prisma.$connect();
    await cleanupGatewayTestUsers(prisma);

    const authService = new PasswordAuthService(
      new PrismaAuthRepository(prisma),
    );
    const owner = await authService.register(
      'strategy-gateway-owner@test.com',
      'ownerpass123',
    );
    const otherOwner = await authService.register(
      'strategy-gateway-other@test.com',
      'otherpass123',
    );
    ownerId = owner.id;
    otherOwnerId = otherOwner.id;
  });

  afterAll(async () => {
    await cleanupGatewayTestUsers(prisma);
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await Promise.all(closeCallbacks.splice(0).map((close) => close()));
  });

  async function startServer(
    options: {
      strategyLiveService?: StrategyLiveService;
      strategyLibraryService?: StrategyLibraryService;
      userId?: string;
    } = {},
  ): Promise<Socket<ServerToClientEvents, ClientToServerEvents>> {
    const httpServer = createServer();
    const socketServer = createSocketServer(httpServer, {
      allowedOrigin: 'http://localhost:3000',
      sessionMiddleware: (req, _res, next) => {
        Object.assign(req, {
          session: { userId: options.userId ?? 'mock-user-id' },
        });
        next();
      },
      ...(options.strategyLiveService === undefined
        ? {}
        : { strategyLiveService: options.strategyLiveService }),
      ...(options.strategyLibraryService === undefined
        ? {}
        : { strategyLibraryService: options.strategyLibraryService }),
    });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const address = httpServer.address();
    if (address === null || typeof address === 'string') {
      throw new Error(
        'Expected the test server to listen on an ephemeral port',
      );
    }
    const client: Socket<ServerToClientEvents, ClientToServerEvents> =
      createClient(`http://127.0.0.1:${address.port}`, {
        transports: ['websocket'],
      });
    closeCallbacks.push(async () => {
      client.disconnect();
      await socketServer.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    });
    await new Promise<void>((resolve) => client.once('connect', resolve));
    return client;
  }

  function buildStrategyLiveService(): {
    strategyLiveService: StrategyLiveService;
    streamHandlersRef: {
      current: Parameters<ExchangeAdapter['openKlineStream']>[1] | undefined;
    };
  } {
    const initialCandles = Array.from({ length: 10 }, (_, index) => ({
      pair: 'BTCUSDT' as const,
      timeframe: '1m' as const,
      openTime: 1_756_000_000_000 + index * 60_000,
      closeTime: 1_756_000_059_999 + index * 60_000,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 10,
      isClosed: true,
    }));
    const streamHandlersRef: {
      current: Parameters<ExchangeAdapter['openKlineStream']>[1] | undefined;
    } = { current: undefined };
    const eventBus = new InMemoryDomainEventBus();
    const marketDataService = new MarketDataService({
      exchangeAdapter: {
        fetchCandles: async () => initialCandles,
        openKlineStream: (_keys, handlers) => {
          streamHandlersRef.current = handlers;
          return () => undefined;
        },
      },
      candleRepository: { upsertClosed: async () => undefined },
      eventPublisher: eventBus,
    });
    const strategyLiveService = new StrategyLiveService({
      eventBus,
      marketDataService,
    });
    closeCallbacks.push(async () => {
      await strategyLiveService.close();
      await marketDataService.close();
    });
    return { strategyLiveService, streamHandlersRef };
  }

  it('subscribes a RuleStrategy with authored params and streams its signal', async () => {
    const { strategyLiveService, streamHandlersRef } =
      buildStrategyLiveService();
    const client = await startServer({ strategyLiveService });
    const snapshotPromise = new Promise<
      Parameters<ServerToClientEvents['strategy:snapshot']>[0]
    >((resolve) => client.once('strategy:snapshot', resolve));
    client.emit('strategy:subscribe', {
      chartId: 'chart-rule',
      pair: 'BTCUSDT',
      strategyId: 'rule',
      timeframe: '1m',
      params: {
        indicators: [{ name: 'RSI', period: 2 }],
        conditions: {
          long: [{ indicator: 'RSI', operator: '<', value: 30 }],
          short: [],
        },
        timeframe: '1m',
      },
    });
    await expect(snapshotPromise).resolves.toMatchObject({
      chartId: 'chart-rule',
      strategyId: 'rule',
      pair: 'BTCUSDT',
      timeframe: '1m',
    });

    const signalPromise = new Promise<
      Parameters<ServerToClientEvents['strategy:signal']>[0]
    >((resolve) => client.once('strategy:signal', resolve));
    const dropCandle = {
      pair: 'BTCUSDT' as const,
      timeframe: '1m' as const,
      openTime: 1_756_000_600_000,
      closeTime: 1_756_000_659_999,
      open: 100,
      high: 101,
      low: 99,
      close: 50,
      volume: 10,
      isClosed: true,
    };
    await streamHandlersRef.current?.onCandle(dropCandle);

    await expect(signalPromise).resolves.toMatchObject({
      pair: 'BTCUSDT',
      timeframe: '1m',
      signal: { action: 'BUY' },
    });
  });

  it('emits strategy:error with a clear message when the authored params are invalid', async () => {
    const eventBus = new InMemoryDomainEventBus();
    const marketDataService = new MarketDataService({
      exchangeAdapter: {
        fetchCandles: async () => [],
        openKlineStream: () => () => undefined,
      },
      candleRepository: { upsertClosed: async () => undefined },
      eventPublisher: eventBus,
    });
    const strategyLiveService = new StrategyLiveService({
      eventBus,
      marketDataService,
    });
    closeCallbacks.push(async () => {
      await strategyLiveService.close();
      await marketDataService.close();
    });

    const client = await startServer({ strategyLiveService });
    const errorPromise = new Promise<
      Parameters<ServerToClientEvents['strategy:error']>[0]
    >((resolve) => client.once('strategy:error', resolve));
    client.emit('strategy:subscribe', {
      chartId: 'chart-rule',
      pair: 'BTCUSDT',
      strategyId: 'rule',
      timeframe: '1m',
      params: {
        indicators: [{ name: 'MACD' }],
        conditions: {
          long: [{ indicator: 'Close', operator: '>', value: 0 }],
          short: [],
        },
        timeframe: '1m',
      },
    });

    await expect(errorPromise).resolves.toMatchObject({
      chartId: 'chart-rule',
      strategyId: 'rule',
      pair: 'BTCUSDT',
      timeframe: '1m',
      phase: 'validation',
      message: expect.stringMatching(/unknown name/i),
    });
  });

  describe('subscribing by strategyVersionId', () => {
    async function saveVersion(name: string) {
      const libraryService = new StrategyLibraryService({
        repository: new PrismaStrategyLibraryRepository(prisma),
      });
      return libraryService.create(ownerId, {
        name,
        source: 'MANUAL',
        strategyId: 'rule',
        params: {
          indicators: [{ name: 'RSI', period: 2 }],
          conditions: {
            long: [{ indicator: 'RSI', operator: '<', value: 30 }],
            short: [],
          },
          timeframe: '1m',
        },
      });
    }

    it('resolves the owning user’s saved params and streams a signal', async () => {
      const { strategyLiveService } = buildStrategyLiveService();
      const strategyLibraryService = new StrategyLibraryService({
        repository: new PrismaStrategyLibraryRepository(prisma),
      });
      const entry = await saveVersion('Gateway version subscribe');

      const client = await startServer({
        strategyLiveService,
        strategyLibraryService,
        userId: ownerId,
      });
      const snapshotPromise = new Promise<
        Parameters<ServerToClientEvents['strategy:snapshot']>[0]
      >((resolve) => client.once('strategy:snapshot', resolve));
      client.emit('strategy:subscribe', {
        chartId: 'chart-version',
        pair: 'BTCUSDT',
        timeframe: '1m',
        strategyVersionId: entry.latestVersion.id,
      });

      await expect(snapshotPromise).resolves.toMatchObject({
        chartId: 'chart-version',
        strategyId: 'rule',
        pair: 'BTCUSDT',
        timeframe: '1m',
      });
    });

    it('refuses to resolve another owner’s saved version', async () => {
      const { strategyLiveService } = buildStrategyLiveService();
      const strategyLibraryService = new StrategyLibraryService({
        repository: new PrismaStrategyLibraryRepository(prisma),
      });
      const entry = await saveVersion('Gateway tenancy target');

      const client = await startServer({
        strategyLiveService,
        strategyLibraryService,
        userId: otherOwnerId,
      });
      const errorPromise = new Promise<
        Parameters<ServerToClientEvents['strategy:error']>[0]
      >((resolve) => client.once('strategy:error', resolve));
      client.emit('strategy:subscribe', {
        chartId: 'chart-tenancy',
        pair: 'BTCUSDT',
        timeframe: '1m',
        strategyVersionId: entry.latestVersion.id,
      });

      await expect(errorPromise).resolves.toMatchObject({
        chartId: 'chart-tenancy',
        phase: 'validation',
        message: expect.stringMatching(/not found/i),
      });
    });
  });
});

async function cleanupGatewayTestUsers(prisma: PrismaClient): Promise<void> {
  const users = await prisma.user.findMany({
    select: { id: true },
    where: {
      email: {
        in: [
          'strategy-gateway-owner@test.com',
          'strategy-gateway-other@test.com',
        ],
      },
    },
  });
  const ownerIds = users.map(({ id }) => id);
  if (ownerIds.length === 0) return;

  await prisma.experiment.deleteMany({ where: { ownerId: { in: ownerIds } } });
  await prisma.strategyVersion.deleteMany({
    where: { ownerId: { in: ownerIds } },
  });
  await prisma.strategyDefinition.deleteMany({
    where: { ownerId: { in: ownerIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: ownerIds } } });
}
