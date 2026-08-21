import { createServer } from 'node:http';

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@crypto-strategy-lab/shared';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';

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
});
