import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@crypto-strategy-lab/shared';
import type { Server } from 'socket.io';

import type { AppLogger } from '../../../../utils/logger';

type MarketDataSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export function registerMarketDataGateway(
  socketServer: MarketDataSocketServer,
  logger: AppLogger,
): void {
  socketServer.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, 'Realtime client connected');

    socket.emit('market-data:status', {
      status: 'ready',
      service: 'market-data-transport',
      serverTime: new Date().toISOString(),
    });

    socket.on('market-data:ping', (ping, acknowledge) => {
      acknowledge({
        ...ping,
        serverReceivedAt: new Date().toISOString(),
      });
    });

    socket.on('disconnect', (reason) => {
      logger.info(
        { socketId: socket.id, reason },
        'Realtime client disconnected',
      );
    });
  });
}
