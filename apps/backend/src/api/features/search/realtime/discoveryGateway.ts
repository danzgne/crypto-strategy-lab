import type {
  ClientToServerEvents,
  DiscoveryProgressPayload,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@crypto-strategy-lab/shared';
import type { Server, Socket } from 'socket.io';
import type { AppLogger } from '@/utils/logger';

export const discoveryRoom = (userId: string): string => `discovery:${userId}`;

type DiscoverySocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type DiscoverySocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export function registerDiscoveryGateway(
  socketServer: DiscoverySocketServer,
  logger: AppLogger,
): {
  emitProgress: (progress: DiscoveryProgressPayload) => void;
} {
  socketServer.on('connection', (socket: DiscoverySocket) => {
    const userId = getSocketUserId(socket);
    if (userId !== undefined) {
      void socket.join(discoveryRoom(userId));
    }
  });

  logger.debug('Discovery realtime gateway registered');

  return {
    emitProgress: (progress: DiscoveryProgressPayload): void => {
      socketServer
        .to(discoveryRoom(progress.userId))
        .emit('discovery:progress', progress);
    },
  };
}

function getSocketUserId(socket: DiscoverySocket): string | undefined {
  return (socket.request as unknown as { session?: { userId?: string } })
    .session?.userId;
}
