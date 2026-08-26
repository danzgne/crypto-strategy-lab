import { createServer } from 'node:http';

import type {
  Candle,
  CandleQuery,
  ClientToServerEvents,
  ServerToClientEvents,
} from '@crypto-strategy-lab/shared';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExchangeAdapter } from '@/api/features/marketData/application/interfaces/exchangeAdapter.interface';
import { MarketDataService } from '@/api/features/marketData/application/services/marketDataService';
import { createSocketServer } from '@/realtime/socketServer';
import { StrategyLiveService } from '@/api/features/strategies/services/strategyLiveService';
import { InMemoryDomainEventBus } from '@/events/inMemoryDomainEventBus';
describe('market-data realtime gateway', () => {
  const closeCallbacks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closeCallbacks.splice(0).map((close) => close()));
  });

  it('round-trips a typed ping after announcing transport readiness', async () => {
    const httpServer = createServer();
    const socketServer = createSocketServer(httpServer, {
      allowedOrigin: 'http://localhost:3000',
      sessionMiddleware: (req, _res, next) => {
        Object.assign(req, {
          session: { userId: 'mock-user-id' },
        });
        next();
      },
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
    });

    const status = await new Promise<{
      service: string;
      status: string;
      serverTime: string;
    }>((resolve) => client.once('market-data:status', resolve));

    const pong = await client.timeout(1_000).emitWithAck('market-data:ping', {
      requestId: 'ping-27',
      clientSentAt: '2026-08-21T10:00:00.000Z',
    });

    expect(status).toMatchObject({
      service: 'market-data-transport',
      status: 'ready',
    });
    expect(Date.parse(status.serverTime)).not.toBeNaN();
    expect(pong).toMatchObject({
      requestId: 'ping-27',
      clientSentAt: '2026-08-21T10:00:00.000Z',
    });
    expect(Date.parse(pong.serverReceivedAt)).not.toBeNaN();
  });

  it('sends a private snapshot and shared live candle updates for a subscription', async () => {
    let streamHandlers:
      Parameters<ExchangeAdapter['openKlineStream']>[1] | undefined;
    const initialCandle = {
      pair: 'BTCUSDT' as const,
      timeframe: '1m' as const,
      openTime: 1_756_000_000_000,
      closeTime: 1_756_000_059_999,
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 10,
      isClosed: false,
    };
    const olderCandle = {
      ...initialCandle,
      openTime: initialCandle.openTime - 60_000,
      closeTime: initialCandle.closeTime - 60_000,
      isClosed: true,
    };
    const exchangeAdapter: ExchangeAdapter = {
      fetchCandles: vi.fn(async (query: CandleQuery) =>
        query.endTime === undefined ? [initialCandle] : [olderCandle],
      ),
      openKlineStream: (_keys, handlers) => {
        streamHandlers = handlers;
        void handlers.onCandle({ ...initialCandle, close: 100.75 });
        return () => undefined;
      },
    };
    const marketDataService = new MarketDataService({
      exchangeAdapter,
      candleRepository: { upsertClosed: async () => undefined },
    });
    const httpServer = createServer();
    const socketServer = createSocketServer(httpServer, {
      allowedOrigin: 'http://localhost:3000',
      sessionMiddleware: (req, _res, next) => {
        Object.assign(req, {
          session: { userId: 'mock-user-id' },
        });
        next();
      },
      marketDataService,
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
      await marketDataService.close();
      await socketServer.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    });

    await new Promise<void>((resolve) =>
      client.once('connect', () => resolve()),
    );
    const receivedMarketEvents: string[] = [];
    client.on('market:snapshot', () => receivedMarketEvents.push('snapshot'));
    client.on('market:candle', () => receivedMarketEvents.push('candle'));
    const snapshotPromise = new Promise<
      Parameters<ServerToClientEvents['market:snapshot']>[0]
    >((resolve) => client.once('market:snapshot', resolve));
    client.emit('market:subscribe', {
      chartId: 'chart-a',
      pair: 'BTCUSDT',
      timeframe: '1m',
      limit: 10,
    });

    const snapshot = await snapshotPromise;
    expect(snapshot).toEqual({
      chartId: 'chart-a',
      pair: 'BTCUSDT',
      timeframe: '1m',
      candles: [{ ...initialCandle, close: 100.75 }],
    });
    expect(receivedMarketEvents).toEqual(['snapshot']);

    const historyPromise = new Promise<
      Parameters<ServerToClientEvents['market:history']>[0]
    >((resolve) => client.once('market:history', resolve));
    client.emit('market:history:request', {
      chartId: 'chart-a',
      pair: 'BTCUSDT',
      timeframe: '1m',
      beforeOpenTime: initialCandle.openTime,
      limit: 10,
    });
    await expect(historyPromise).resolves.toEqual({
      chartId: 'chart-a',
      pair: 'BTCUSDT',
      timeframe: '1m',
      candles: [olderCandle],
      hasMore: false,
    });

    const candlePromise = new Promise<
      Parameters<ServerToClientEvents['market:candle']>[0]
    >((resolve) => client.once('market:candle', resolve));
    const liveCandle = { ...initialCandle, close: 101.5 };
    await streamHandlers?.onCandle(liveCandle);

    await expect(candlePromise).resolves.toEqual({
      pair: 'BTCUSDT',
      timeframe: '1m',
      candle: liveCandle,
    });
    expect(receivedMarketEvents).toEqual(['snapshot', 'candle']);
  });

  it('shares one upstream stream when two panels subscribe to the same market key', async () => {
    let streamHandlers:
      Parameters<ExchangeAdapter['openKlineStream']>[1] | undefined;
    const closeStream = vi.fn();
    const initialCandle = {
      pair: 'BTCUSDT' as const,
      timeframe: '5m' as const,
      openTime: 1_756_000_000_000,
      closeTime: 1_756_000_299_999,
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 10,
      isClosed: false,
    };
    const exchangeAdapter: ExchangeAdapter = {
      fetchCandles: vi.fn(async () => [initialCandle]),
      openKlineStream: vi.fn((_keys, handlers) => {
        streamHandlers = handlers;
        return closeStream;
      }),
    };
    const marketDataService = new MarketDataService({
      exchangeAdapter,
      candleRepository: { upsertClosed: async () => undefined },
    });
    const httpServer = createServer();
    const socketServer = createSocketServer(httpServer, {
      allowedOrigin: 'http://localhost:3000',
      marketDataService,
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
      await marketDataService.close();
      await socketServer.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    });

    await new Promise<void>((resolve) => client.once('connect', resolve));
    const snapshots: string[] = [];
    client.on('market:snapshot', ({ chartId }) => snapshots.push(chartId));
    client.emit('market:subscribe', {
      chartId: 'chart-a',
      pair: 'BTCUSDT',
      timeframe: '5m',
    });
    client.emit('market:subscribe', {
      chartId: 'chart-b',
      pair: 'BTCUSDT',
      timeframe: '5m',
    });

    await new Promise<void>((resolve) => {
      const check = (): void => {
        if (snapshots.length === 2) {
          resolve();
          return;
        }
        setTimeout(check, 1);
      };
      check();
    });

    expect(exchangeAdapter.openKlineStream).toHaveBeenCalledOnce();
    expect(exchangeAdapter.fetchCandles).toHaveBeenCalledOnce();
    expect(snapshots.sort()).toEqual(['chart-a', 'chart-b']);

    const updates: unknown[] = [];
    client.on('market:candle', (update) => updates.push(update));
    await streamHandlers?.onCandle({ ...initialCandle, close: 101.5 });
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    expect(updates).toHaveLength(1);

    client.emit('market:unsubscribe', {
      chartId: 'chart-a',
      pair: 'BTCUSDT',
      timeframe: '5m',
    });
    client.emit('market:unsubscribe', {
      chartId: 'chart-b',
      pair: 'BTCUSDT',
      timeframe: '5m',
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    expect(closeStream).toHaveBeenCalledOnce();
  });

  it('pushes one combined MA signal payload when an enabled strategy sees a closed candle', async () => {
    const startTime = 1_756_000_000_000;
    const makeCandle = (index: number, close: number): Candle => {
      const openTime = startTime + index * 60_000;
      return {
        pair: 'BTCUSDT',
        timeframe: '1m',
        openTime,
        closeTime: openTime + 59_999,
        open: close,
        high: close + 1,
        low: close - 1,
        close,
        volume: 10 + index,
        isClosed: true,
      };
    };
    const initialCandles = Array.from({ length: 50 }, (_, index) =>
      makeCandle(index, 10),
    );
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
    const httpServer = createServer();
    const socketServer = createSocketServer(httpServer, {
      allowedOrigin: 'http://localhost:3000',
      sessionMiddleware: (req, _res, next) => {
        Object.assign(req, {
          session: { userId: 'mock-user-id' },
        });
        next();
      },
      marketDataService,
      strategyLiveService,
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
      await strategyLiveService.close();
      await marketDataService.close();
      await socketServer.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    });

    await new Promise<void>((resolve) => client.once('connect', resolve));
    const strategySnapshotPromise = new Promise<
      Parameters<ServerToClientEvents['strategy:snapshot']>[0]
    >((resolve) => client.once('strategy:snapshot', resolve));
    const signalPromise = new Promise<
      Parameters<ServerToClientEvents['strategy:signal']>[0]
    >((resolve) => client.once('strategy:signal', resolve));
    client.emit('strategy:subscribe', {
      chartId: 'chart-ma',
      pair: 'BTCUSDT',
      strategyId: 'ma',
      timeframe: '1m',
      limit: 500,
    });

    await expect(strategySnapshotPromise).resolves.toMatchObject({
      chartId: 'chart-ma',
      strategyId: 'ma',
      pair: 'BTCUSDT',
      timeframe: '1m',
      signals: expect.any(Array),
    });

    await new Promise<void>((resolve) => {
      const check = (): void => {
        if (streamHandlers !== undefined) {
          resolve();
          return;
        }
        setTimeout(check, 1);
      };
      check();
    });

    const crossingCandle = makeCandle(50, 12);
    await streamHandlers?.onCandle(crossingCandle);

    await expect(signalPromise).resolves.toEqual({
      pair: 'BTCUSDT',
      timeframe: '1m',
      candle: crossingCandle,
      indicators: { MA_20: 10.1, MA_50: 10.04 },
      signal: {
        action: 'BUY',
        indicators: { MA_20: 10.1, MA_50: 10.04 },
      },
    });
  });
});
