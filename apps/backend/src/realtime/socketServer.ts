import type { Server as HttpServer } from 'node:http';

import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@crypto-strategy-lab/shared';
import { Server, type Socket } from 'socket.io';

import type { MarketDataService } from '@/api/features/marketData/application/services/marketDataService';
import { registerMarketDataGateway } from '@/api/features/marketData/realtime/marketDataGateway';
import type { MarketTickService } from '@/api/features/marketData/application/services/marketTickService';
import { registerMarketTickGateway } from '@/api/features/marketData/realtime/marketTickGateway';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { StrategyLiveService } from '@/api/features/strategies/services/strategyLiveService';
import { registerStrategyGateway } from '@/api/features/strategies/realtime/strategyGateway';
import {
  registerLeaderboardGateway,
  type LeaderboardRealtimeEventBus,
} from '@/api/features/leaderboard/realtime/leaderboardGateway';
import { createAppLogger, type AppLogger } from '@/utils/logger';

interface SocketServerOptions {
  allowedOrigin: string;
  sessionMiddleware: RequestHandler;
  logger?: AppLogger;
  marketDataService?: MarketDataService;
  marketDataSource?: string;
  marketTickService?: MarketTickService;
  strategyLiveService?: StrategyLiveService;
  leaderboardEventBus?: LeaderboardRealtimeEventBus;
}

export function createSocketServer(
  httpServer: HttpServer,
  {
    allowedOrigin,
    sessionMiddleware,
    logger,
    marketDataService,
    marketDataSource,
    marketTickService,
    strategyLiveService,
    leaderboardEventBus,
  }: SocketServerOptions,
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

  const wrap =
    (middleware: RequestHandler) =>
    (
      socket: Socket<
        ClientToServerEvents,
        ServerToClientEvents,
        InterServerEvents,
        SocketData
      >,
      next: (err?: Error) => void,
    ) =>
      middleware(
        socket.request as unknown as Request,
        {} as unknown as Response,
        next as NextFunction,
      );
  socketServer.use(wrap(sessionMiddleware));

  socketServer.use((socket, next) => {
    const session = (
      socket.request as Request & { session?: { userId?: string } }
    ).session;
    if (!session || !session.userId) {
      return next(new Error('Unauthorized'));
    }
    next();
  });

  registerMarketDataGateway(
    socketServer,
    logger ?? createAppLogger({ service: 'backend-test', enabled: false }),
    marketDataService,
    marketDataSource,
  );
  registerMarketTickGateway(
    socketServer,
    logger ?? createAppLogger({ service: 'backend-test', enabled: false }),
    marketTickService,
  );
  registerStrategyGateway(
    socketServer,
    logger ?? createAppLogger({ service: 'backend-test', enabled: false }),
    strategyLiveService,
  );
  if (leaderboardEventBus !== undefined) {
    registerLeaderboardGateway(
      socketServer,
      leaderboardEventBus,
      logger ?? createAppLogger({ service: 'backend-test', enabled: false }),
    );
  }
  return socketServer;
}
