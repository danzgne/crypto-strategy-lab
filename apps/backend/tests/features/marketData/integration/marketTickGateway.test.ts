import { createServer } from 'node:http';

import type {
  ClientToServerEvents,
  ServerToClientEvents,
  Tick,
} from '@crypto-strategy-lab/shared';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MarketTickSubscriptionHandlers } from '@/api/features/marketData/application/services/marketTickService';
import type { MarketTickService } from '@/api/features/marketData/application/services/marketTickService';
import { createSocketServer } from '@/realtime/socketServer';

describe('market-tick realtime gateway', () => {
  const closeCallbacks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closeCallbacks.splice(0).map((close) => close()));
  });

  it('sends a private recent-tick snapshot and shared live tick updates', async () => {
    const tick: Tick = {
      pair: 'BTCUSDT',
      tradeId: 'trade-1',
      time: 1_756_000_300_100,
      price: 81_049.99,
      quantity: 0.012,
      side: 'BUY',
    };
    const subscriptions: Array<{
      handlers?: MarketTickSubscriptionHandlers;
      unsubscribe: ReturnType<typeof vi.fn>;
    }> = [];
    const subscribe = vi.fn(
      async (
        _query: { pair: string; limit?: number },
        handlers?: MarketTickSubscriptionHandlers,
      ) => {
        const subscription = {
          unsubscribe: vi.fn().mockResolvedValue(undefined),
          ...(handlers === undefined ? {} : { handlers }),
        };
        subscriptions.push(subscription);
        return { ticks: [tick], unsubscribe: subscription.unsubscribe };
      },
    );
    const marketTickService = {
      subscribe,
    } as unknown as MarketTickService;
    const httpServer = createServer();
    const socketServer = createSocketServer(httpServer, {
      allowedOrigin: 'http://localhost:3000',
      marketTickService,
      sessionMiddleware: (req, _res, next) => {
        Object.assign(req, { session: { userId: 'mock-user-id' } });
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
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    });

    await new Promise<void>((resolve) => client.once('connect', resolve));

    const snapshotPromise = new Promise<Tick[]>((resolve) =>
      client.once('market:ticks:snapshot', (snapshot) =>
        resolve(snapshot.ticks),
      ),
    );
    client.emit('market:ticks:subscribe', {
      pair: 'btcusdt',
      limit: 5,
    });

    await expect(snapshotPromise).resolves.toEqual([tick]);
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(subscribe).toHaveBeenNthCalledWith(
      1,
      { pair: 'BTCUSDT', limit: 5 },
      expect.objectContaining({ onTick: expect.any(Function) }),
    );
    expect(subscribe).toHaveBeenNthCalledWith(2, {
      pair: 'BTCUSDT',
      limit: 5,
    });

    const updatePromise = new Promise<Tick>((resolve) =>
      client.once('market:tick', (update) => resolve(update.tick)),
    );
    subscriptions[0]?.handlers?.onTick?.(tick);
    await expect(updatePromise).resolves.toEqual(tick);

    client.emit('market:ticks:unsubscribe', { pair: 'BTCUSDT' });
    await vi.waitFor(() =>
      expect(subscriptions[0]?.unsubscribe).toHaveBeenCalledOnce(),
    );
  });
});
