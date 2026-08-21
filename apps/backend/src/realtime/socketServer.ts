import type { Server as HttpServer } from 'node:http';

import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@crypto-strategy-lab/shared';
import { Server } from 'socket.io';

import { registerMarketDataGateway } from '../api/features/marketData/realtime/marketDataGateway';
import { createAppLogger, type AppLogger } from '../utils/logger';

interface SocketServerOptions {
  allowedOrigin: string;
  logger?: AppLogger;
}

export function createSocketServer(
  httpServer: HttpServer,
  { allowedOrigin, logger }: SocketServerOptions,
): Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
> {
  const socketServer = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: allowedOrigin,
      credentials: true,
    },
  });

  registerMarketDataGateway(
    socketServer,
    logger ?? createAppLogger({ service: 'backend-test', enabled: false }),
  );
  return socketServer;
}
