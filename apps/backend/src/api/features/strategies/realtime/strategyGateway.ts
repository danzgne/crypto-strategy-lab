import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
  StrategySubscribeRequest,
  StrategyUnsubscribeRequest,
} from '@crypto-strategy-lab/shared';
import { StrategyRegistry } from '@crypto-strategy-lab/strategy-engine';
import type { Server, Socket } from 'socket.io';

import type { AppLogger } from '../../../../utils/logger';
import {
  type StrategyLiveService,
  type StrategySubscription,
} from '../services/strategyLiveService';

type StrategySocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type StrategySocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

interface ActiveSocketStrategySubscription {
  request: StrategySubscribeRequest;
  subscription: StrategySubscription;
}

export function registerStrategyGateway(
  socketServer: StrategySocketServer,
  logger: AppLogger,
  strategyLiveService?: StrategyLiveService,
): void {
  const subscriptions = new Map<
    string,
    Map<string, ActiveSocketStrategySubscription>
  >();

  socketServer.on('connection', (socket) => {
    const sendCatalog = (): void => {
      socket.emit('strategy:catalog', {
        strategyIds: StrategyRegistry.list(),
      });
    };
    socket.on('strategy:catalog:request', sendCatalog);
    sendCatalog();
    socket.on('strategy:subscribe', (request) => {
      void subscribeStrategy(
        socket,
        request,
        strategyLiveService,
        subscriptions,
        logger,
      );
    });
    socket.on('strategy:unsubscribe', (request) => {
      void unsubscribeStrategy(socket, request, subscriptions);
    });
    socket.on('disconnect', () => {
      void unsubscribeAll(socket, subscriptions);
    });
  });
}

async function subscribeStrategy(
  socket: StrategySocket,
  request: StrategySubscribeRequest,
  strategyLiveService: StrategyLiveService | undefined,
  subscriptions: Map<string, Map<string, ActiveSocketStrategySubscription>>,
  logger: AppLogger,
): Promise<void> {
  if (strategyLiveService === undefined || !isValidRequest(request)) return;
  await unsubscribeStrategy(socket, request, subscriptions);

  try {
    const subscription = await strategyLiveService.subscribe(
      {
        strategyId: request.strategyId,
        pair: request.pair,
        timeframe: request.timeframe,
      },
      (update) => socket.emit('strategy:signal', update),
    );
    let socketSubscriptions = subscriptions.get(socket.id);
    if (socketSubscriptions === undefined) {
      socketSubscriptions = new Map();
      subscriptions.set(socket.id, socketSubscriptions);
    }
    socketSubscriptions.set(subscriptionKey(request), {
      request,
      subscription,
    });
  } catch (error) {
    logger.error(
      {
        err: error,
        socketId: socket.id,
        strategyId: request.strategyId,
        pair: request.pair,
        timeframe: request.timeframe,
      },
      'Strategy subscription failed',
    );
  }
}

async function unsubscribeStrategy(
  socket: StrategySocket,
  request: StrategyUnsubscribeRequest,
  subscriptions: Map<string, Map<string, ActiveSocketStrategySubscription>>,
): Promise<void> {
  const socketSubscriptions = subscriptions.get(socket.id);
  const active = socketSubscriptions?.get(subscriptionKey(request));
  if (active === undefined) return;
  socketSubscriptions?.delete(subscriptionKey(request));
  if (socketSubscriptions?.size === 0) subscriptions.delete(socket.id);
  await active.subscription.unsubscribe();
}

async function unsubscribeAll(
  socket: StrategySocket,
  subscriptions: Map<string, Map<string, ActiveSocketStrategySubscription>>,
): Promise<void> {
  const socketSubscriptions = subscriptions.get(socket.id);
  if (socketSubscriptions === undefined) return;
  subscriptions.delete(socket.id);
  await Promise.all(
    [...socketSubscriptions.values()].map(({ subscription }) =>
      subscription.unsubscribe(),
    ),
  );
}

function isValidRequest(request: StrategySubscribeRequest): boolean {
  return (
    typeof request.chartId === 'string' &&
    request.chartId.length > 0 &&
    typeof request.strategyId === 'string' &&
    request.strategyId.length > 0 &&
    typeof request.pair === 'string' &&
    request.pair.length > 0 &&
    typeof request.timeframe === 'string'
  );
}

function subscriptionKey(
  request: StrategySubscribeRequest | StrategyUnsubscribeRequest,
): string {
  return `${request.chartId}:${request.strategyId}`;
}
