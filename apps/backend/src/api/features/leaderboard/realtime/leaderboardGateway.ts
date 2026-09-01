import type {
  ClientToServerEvents,
  DomainEventEnvelope,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@crypto-strategy-lab/shared';
import type { Server, Socket } from 'socket.io';

import type { AppLogger } from '@/utils/logger';

export interface LeaderboardRealtimeEventBus {
  subscribe(
    name: 'LeaderboardUpdated',
    handler: (
      event: DomainEventEnvelope<'LeaderboardUpdated'>,
    ) => void | Promise<void>,
  ): () => void;
}

const leaderboardRoom = (userId: string): string => `leaderboard:${userId}`;

type LeaderboardSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type LeaderboardSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export function registerLeaderboardGateway(
  socketServer: LeaderboardSocketServer,
  eventBus: LeaderboardRealtimeEventBus,
  logger: AppLogger,
): () => void {
  const unsubscribe = eventBus.subscribe('LeaderboardUpdated', (event) => {
    socketServer
      .to(leaderboardRoom(event.payload.userId))
      .emit('leaderboard:updated', event.payload);
  });

  socketServer.on('connection', (socket) => {
    const userId = getSocketUserId(socket);
    if (userId === undefined) return;
    void socket.join(leaderboardRoom(userId));
  });
  socketServer.engine.once('close', unsubscribe);
  logger.debug('Leaderboard realtime gateway registered');
  return unsubscribe;
}

function getSocketUserId(socket: LeaderboardSocket): string | undefined {
  return (socket.request as unknown as { session?: { userId?: string } })
    .session?.userId;
}
