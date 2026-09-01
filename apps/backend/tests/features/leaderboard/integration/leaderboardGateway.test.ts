import { createServer } from 'node:http';

import {
  createDomainEvent,
  type ClientToServerEvents,
  type LeaderboardUpdatedPayload,
  type LeaderboardSnapshot,
  type ServerToClientEvents,
} from '@crypto-strategy-lab/shared';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';

import { InMemoryDomainEventBus } from '@/events/inMemoryDomainEventBus';
import { createSocketServer } from '@/realtime/socketServer';

describe('leaderboard realtime gateway', () => {
  const closeCallbacks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closeCallbacks.splice(0).map((close) => close()));
  });

  it('delivers updates only to the event owner room', async () => {
    const httpServer = createServer();
    const eventBus = new InMemoryDomainEventBus();
    const socketServer = createSocketServer(httpServer, {
      allowedOrigin: 'http://localhost:3000',
      leaderboardEventBus: eventBus,
      sessionMiddleware: (request, _response, next) => {
        const userId = request.headers['x-test-user'];
        Object.assign(request, {
          session: {
            userId: typeof userId === 'string' ? userId : 'unknown-user',
          },
        });
        next();
      },
    });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const address = httpServer.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected an ephemeral test server address');
    }

    const ownerClient: Socket<ServerToClientEvents, ClientToServerEvents> =
      createClient(`http://127.0.0.1:${address.port}`, {
        extraHeaders: { 'x-test-user': 'owner-1' },
        transports: ['websocket'],
      });
    const otherClient: Socket<ServerToClientEvents, ClientToServerEvents> =
      createClient(`http://127.0.0.1:${address.port}`, {
        extraHeaders: { 'x-test-user': 'owner-2' },
        transports: ['websocket'],
      });
    closeCallbacks.push(async () => {
      ownerClient.disconnect();
      otherClient.disconnect();
      await socketServer.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    });

    await Promise.all([
      waitForConnect(ownerClient),
      waitForConnect(otherClient),
    ]);
    const snapshot = createSnapshot();
    const ownerUpdate = waitForLeaderboardUpdate(ownerClient);
    const otherUpdate = waitForLeaderboardUpdate(otherClient);
    await eventBus.publish(createDomainEvent('LeaderboardUpdated', snapshot));

    await expect(ownerUpdate).resolves.toEqual(snapshot);
    await expect(
      Promise.race([
        otherUpdate,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 100)),
      ]),
    ).resolves.toBeNull();
  });
});

function waitForConnect(
  client: Socket<ServerToClientEvents, ClientToServerEvents>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    client.once('connect', () => resolve());
    client.once('connect_error', reject);
  });
}

function waitForLeaderboardUpdate(
  client: Socket<ServerToClientEvents, ClientToServerEvents>,
): Promise<LeaderboardSnapshot> {
  return new Promise((resolve) => {
    client.once('leaderboard:updated', resolve);
  });
}

function createSnapshot(): LeaderboardUpdatedPayload {
  return {
    entries: [
      {
        endTime: 2,
        experimentId: 'experiment-1',
        maxDrawdown: '0.1',
        memberStrategies: [{ label: 'MA', strategyId: 'ma' }],
        pair: 'BTCUSDT',
        rank: 1,
        return: '0.2',
        score: '0.8',
        startTime: 1,
        strategyDisplayName: 'MA',
        strategyVersionId: 'version-1',
        timeframe: '1m',
        totalProfit: '100',
        totalTrades: 4,
        winRate: '0.75',
      },
    ],
    k: 10,
    updatedAt: '2026-01-01T00:00:00.000Z',
    userId: 'owner-1',
  };
}
