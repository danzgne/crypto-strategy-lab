import { createServer } from 'node:http';

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@crypto-strategy-lab/shared';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';

import type { ExchangeAdapter } from '../../../../src/api/features/marketData/application/interfaces/exchangeAdapter.interface';
import { MarketDataService } from '../../../../src/api/features/marketData/application/services/marketDataService';
import { createSocketServer } from '../../../../src/realtime/socketServer';

describe('market-data realtime gateway', () => {
  const closeCallbacks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closeCallbacks.splice(0).map((close) => close()));
  });

  it('round-trips a typed ping after announcing transport readiness', async () => {
    const httpServer = createServer();
    const socketServer = createSocketServer(httpServer, {
      allowedOrigin: 'http://localhost:3000',
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
    const exchangeAdapter: ExchangeAdapter = {
      fetchCandles: async () => [initialCandle],
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
});
