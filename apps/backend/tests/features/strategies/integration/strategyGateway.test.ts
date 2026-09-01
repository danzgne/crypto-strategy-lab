import { createServer } from 'node:http';

import type {
  ClientToServerEvents,
  ServerToClientEvents,
  StrategyCatalog,
} from '@crypto-strategy-lab/shared';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';

import type { ExchangeAdapter } from '@/api/features/marketData/application/interfaces/exchangeAdapter.interface';
import { MarketDataService } from '@/api/features/marketData/application/services/marketDataService';
import { StrategyLiveService } from '@/api/features/strategies/services/strategyLiveService';
import { InMemoryDomainEventBus } from '@/events/inMemoryDomainEventBus';
import { createSocketServer } from '@/realtime/socketServer';

describe('strategy realtime gateway', () => {
  const closeCallbacks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closeCallbacks.splice(0).map((close) => close()));
  });

  async function startServer(
    strategyLiveService?: StrategyLiveService,
  ): Promise<Socket<ServerToClientEvents, ClientToServerEvents>> {
    const httpServer = createServer();
    const socketServer = createSocketServer(httpServer, {
      allowedOrigin: 'http://localhost:3000',
      sessionMiddleware: (req, _res, next) => {
        Object.assign(req, { session: { userId: 'mock-user-id' } });
        next();
      },
      ...(strategyLiveService === undefined ? {} : { strategyLiveService }),
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

  it('marks only strategies with required params as requiresParams in the catalog', async () => {
    const client = await startServer();
    const catalogPromise = new Promise<StrategyCatalog>((resolve) =>
      client.once('strategy:catalog', resolve),
    );
    client.emit('strategy:catalog:request');
    const catalog = await catalogPromise;

    const ma = catalog.strategies.find((entry) => entry.id === 'ma');
    const rule = catalog.strategies.find((entry) => entry.id === 'rule');
    expect(ma).toMatchObject({
      id: 'ma',
      paramsSchema: { type: 'object' },
      requiresParams: false,
    });
    expect(rule).toMatchObject({
      id: 'rule',
      paramsSchema: { type: 'object' },
      requiresParams: true,
    });
    expect(catalog.strategyIds).toEqual(expect.arrayContaining(['ma', 'rule']));
  });

  it('subscribes a RuleStrategy with authored params and streams its signal', async () => {
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
    let streamHandlers:
      Parameters<ExchangeAdapter['openKlineStream']>[1] | undefined;
    const eventBus = new InMemoryDomainEventBus();
    const marketDataService = new MarketDataService({
      exchangeAdapter: {
        fetchCandles: async () => initialCandles,
        openKlineStream: (_keys, handlers) => {
          streamHandlers = handlers;
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

    const client = await startServer(strategyLiveService);
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
      ...initialCandles[0]!,
      openTime: 1_756_000_600_000,
      closeTime: 1_756_000_659_999,
      close: 50,
    };
    await streamHandlers?.onCandle(dropCandle);

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

    const client = await startServer(strategyLiveService);
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
});
