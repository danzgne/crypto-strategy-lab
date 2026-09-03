import {
  isTimeframe,
  type ClientToServerEvents,
  type InterServerEvents,
  type MarketHistoryRequest,
  type MarketSubscribeRequest,
  type MarketUnsubscribeRequest,
  type ServerToClientEvents,
  type SocketData,
  type Timeframe,
} from '@crypto-strategy-lab/shared';
import { normalizeCandleLimit } from '@crypto-strategy-lab/shared/market-data';
import type { Server, Socket } from 'socket.io';

import type { AppLogger } from '@/utils/logger';
import type {
  MarketDataService,
  MarketDataSubscription,
} from '../application/services/marketDataService';

const DEFAULT_MARKET_DATA_SOURCE = 'Market Data Service';

type MarketDataSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type MarketDataSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

interface RoomState {
  room: string;
  pair: string;
  timeframe: Timeframe;
  memberCount: number;
  status: 'LIVE' | 'RECONNECTING' | 'STALE';
  snapshotSent: boolean;
  rootSubscription?: MarketDataSubscription;
  ready: Promise<void>;
}

interface ClientSubscription {
  roomKey: string;
  room: string;
  pair: string;
  timeframe: Timeframe;
  subscription: MarketDataSubscription;
}

export function registerMarketDataGateway(
  socketServer: MarketDataSocketServer,
  logger: AppLogger,
  marketDataService?: MarketDataService,
  marketDataSource = DEFAULT_MARKET_DATA_SOURCE,
): void {
  const roomStates = new Map<string, RoomState>();
  const clientSubscriptions = new Map<
    string,
    Map<string, ClientSubscription>
  >();

  socketServer.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, 'Realtime client connected');
    const subscriptionQueues = new Map<string, Promise<void>>();

    const enqueueSubscriptionOperation = (
      chartId: string,
      operation: () => Promise<void>,
    ): void => {
      const previous = subscriptionQueues.get(chartId) ?? Promise.resolve();
      const next = previous
        .then(operation, operation)
        .catch((error: unknown) => {
          logger.error(
            { err: error, chartId, socketId: socket.id },
            'Market subscription operation failed',
          );
        });
      subscriptionQueues.set(chartId, next);
      void next.finally(() => {
        if (subscriptionQueues.get(chartId) === next) {
          subscriptionQueues.delete(chartId);
        }
      });
    };

    socket.emit('market-data:status', {
      status: 'ready',
      service: 'market-data-transport',
      source: marketDataSource,
      serverTime: new Date().toISOString(),
    });

    socket.on('market-data:ping', (ping, acknowledge) => {
      acknowledge({
        ...ping,
        source: marketDataSource,
        serverReceivedAt: new Date().toISOString(),
      });
    });

    socket.on('market:subscribe', (request) => {
      enqueueSubscriptionOperation(request.chartId, () =>
        subscribeSocket(
          socket,
          request,
          marketDataService,
          roomStates,
          clientSubscriptions,
          logger,
          socketServer,
        ),
      );
    });

    socket.on('market:history:request', (request) => {
      void requestHistorySocket(socket, request, marketDataService, logger);
    });

    socket.on('market:unsubscribe', (request) => {
      enqueueSubscriptionOperation(request.chartId, () =>
        unsubscribeSocket(
          socket,
          request,
          roomStates,
          clientSubscriptions,
          logger,
        ),
      );
    });

    socket.on('disconnect', (reason) => {
      void Promise.all([...subscriptionQueues.values()])
        .then(() =>
          unsubscribeAll(socket, roomStates, clientSubscriptions, logger),
        )
        .catch((error: unknown) => {
          logger.error(
            { err: error, socketId: socket.id },
            'Market subscriptions could not be released',
          );
        })
        .finally(() => subscriptionQueues.clear());
      logger.info(
        { socketId: socket.id, reason },
        'Realtime client disconnected',
      );
    });
  });
}

async function requestHistorySocket(
  socket: MarketDataSocket,
  request: MarketHistoryRequest,
  marketDataService: MarketDataService | undefined,
  logger: AppLogger,
): Promise<void> {
  const normalizedRequest = normalizeHistoryRequest(request);
  if (normalizedRequest === null || marketDataService === undefined) {
    if (normalizedRequest !== null) {
      socket.emit('market:history', {
        chartId: normalizedRequest.chartId,
        pair: normalizedRequest.pair,
        timeframe: normalizedRequest.timeframe,
        candles: [],
        hasMore: false,
      });
    }
    return;
  }

  try {
    const candles = await marketDataService.loadHistoryBefore(
      {
        pair: normalizedRequest.pair,
        timeframe: normalizedRequest.timeframe,
        limit: normalizeCandleLimit(normalizedRequest.limit),
      },
      normalizedRequest.beforeOpenTime,
    );
    socket.emit('market:history', {
      chartId: normalizedRequest.chartId,
      pair: normalizedRequest.pair,
      timeframe: normalizedRequest.timeframe,
      candles,
      hasMore: candles.length === normalizedRequest.limit,
    });
  } catch (error) {
    logger.error(
      {
        err: error,
        pair: normalizedRequest.pair,
        timeframe: normalizedRequest.timeframe,
        beforeOpenTime: normalizedRequest.beforeOpenTime,
      },
      'Market history request failed',
    );
    socket.emit('market:history', {
      chartId: normalizedRequest.chartId,
      pair: normalizedRequest.pair,
      timeframe: normalizedRequest.timeframe,
      candles: [],
      hasMore: false,
    });
  }
}

async function subscribeSocket(
  socket: MarketDataSocket,
  request: MarketSubscribeRequest,
  marketDataService: MarketDataService | undefined,
  roomStates: Map<string, RoomState>,
  clientSubscriptions: Map<string, Map<string, ClientSubscription>>,
  logger: AppLogger,
  socketServer: MarketDataSocketServer,
): Promise<void> {
  const normalizedRequest = normalizeSubscribeRequest(request);
  if (normalizedRequest === null || marketDataService === undefined) {
    socket.emit('market:status', {
      pair: request.pair,
      timeframe: request.timeframe,
      status: 'STALE',
      detail:
        marketDataService === undefined
          ? 'Market Data Service is not configured'
          : 'Market subscription request is invalid',
      chartId: request.chartId,
    });
    return;
  }

  await unsubscribeSocket(
    socket,
    normalizedRequest,
    roomStates,
    clientSubscriptions,
    logger,
  );

  const room = marketRoom(normalizedRequest.pair, normalizedRequest.timeframe);
  const roomKey = room;
  await socket.join(room);

  let roomState = roomStates.get(roomKey);
  if (roomState === undefined) {
    roomState = {
      room,
      pair: normalizedRequest.pair,
      timeframe: normalizedRequest.timeframe,
      memberCount: 0,
      status: 'RECONNECTING',
      snapshotSent: false,
      ready: Promise.resolve(),
    };
    roomStates.set(roomKey, roomState);
    roomState.ready = initializeRoom(
      roomState,
      normalizedRequest,
      marketDataService,
      roomStates,
      socketServer,
    );
  }

  try {
    await roomState.ready;
    const subscription = await marketDataService.subscribe(normalizedRequest);

    roomState.memberCount += 1;
    let subscriptions = clientSubscriptions.get(socket.id);
    if (subscriptions === undefined) {
      subscriptions = new Map();
      clientSubscriptions.set(socket.id, subscriptions);
    }
    subscriptions.set(normalizedRequest.chartId, {
      roomKey,
      room,
      pair: normalizedRequest.pair,
      timeframe: normalizedRequest.timeframe,
      subscription,
    });

    socket.emit('market:snapshot', {
      chartId: normalizedRequest.chartId,
      pair: normalizedRequest.pair,
      timeframe: normalizedRequest.timeframe,
      candles: subscription.candles,
    });
    roomState.snapshotSent = true;
    socket.emit('market:status', {
      pair: normalizedRequest.pair,
      timeframe: normalizedRequest.timeframe,
      status: roomState.status,
      chartId: normalizedRequest.chartId,
    });
  } catch (error) {
    await socket.leave(room);
    if (roomStates.get(roomKey) === roomState) {
      roomStates.delete(roomKey);
      await roomState.rootSubscription?.unsubscribe();
    }
    logger.error(
      {
        err: error,
        socketId: socket.id,
        pair: normalizedRequest.pair,
        timeframe: normalizedRequest.timeframe,
      },
      'Market subscription failed',
    );
    socket.emit('market:status', {
      pair: normalizedRequest.pair,
      timeframe: normalizedRequest.timeframe,
      status: 'STALE',
      detail: 'Market history could not be loaded',
      chartId: normalizedRequest.chartId,
    });
  }
}

async function initializeRoom(
  roomState: RoomState,
  request: MarketSubscribeRequest,
  marketDataService: MarketDataService,
  roomStates: Map<string, RoomState>,
  socketServer: MarketDataSocketServer,
): Promise<void> {
  const subscription = await marketDataService.subscribe(request, {
    onCandle: (candle) => {
      if (roomStates.get(roomState.room) !== roomState) return;
      if (!roomState.snapshotSent) return;
      socketServer.to(roomState.room).emit('market:candle', {
        pair: roomState.pair,
        timeframe: roomState.timeframe,
        candle,
      });
    },
    onStatus: (status) => {
      if (roomStates.get(roomState.room) !== roomState) return;
      roomState.status = status;
      socketServer.to(roomState.room).emit('market:status', {
        pair: roomState.pair,
        timeframe: roomState.timeframe,
        status,
      });
    },
  });
  roomState.rootSubscription = subscription;
}

async function unsubscribeSocket(
  socket: MarketDataSocket,
  request: MarketUnsubscribeRequest,
  roomStates: Map<string, RoomState>,
  clientSubscriptions: Map<string, Map<string, ClientSubscription>>,
  logger: AppLogger,
): Promise<void> {
  const subscriptions = clientSubscriptions.get(socket.id);
  const clientSubscription = subscriptions?.get(request.chartId);
  if (clientSubscription === undefined) return;

  subscriptions?.delete(request.chartId);
  if (subscriptions?.size === 0) clientSubscriptions.delete(socket.id);
  await clientSubscription.subscription.unsubscribe();
  const stillSubscribedToRoom = [...(subscriptions?.values() ?? [])].some(
    (subscription) => subscription.room === clientSubscription.room,
  );
  if (!stillSubscribedToRoom) await socket.leave(clientSubscription.room);

  const roomState = roomStates.get(clientSubscription.roomKey);
  if (roomState === undefined) return;
  roomState.memberCount = Math.max(0, roomState.memberCount - 1);
  if (roomState.memberCount > 0) return;
  roomStates.delete(clientSubscription.roomKey);
  await roomState.rootSubscription?.unsubscribe();
  logger.debug({ room: clientSubscription.room }, 'Market data room released');
}

async function unsubscribeAll(
  socket: MarketDataSocket,
  roomStates: Map<string, RoomState>,
  clientSubscriptions: Map<string, Map<string, ClientSubscription>>,
  logger: AppLogger,
): Promise<void> {
  const subscriptions = clientSubscriptions.get(socket.id);
  if (subscriptions === undefined) return;
  const requests = [...subscriptions.entries()].map(
    ([chartId, subscription]) =>
      ({
        chartId,
        pair: subscription.pair,
        timeframe: subscription.timeframe,
      }) satisfies MarketUnsubscribeRequest,
  );
  await Promise.all(
    requests.map((request) =>
      unsubscribeSocket(
        socket,
        request,
        roomStates,
        clientSubscriptions,
        logger,
      ),
    ),
  );
}

function normalizeSubscribeRequest(
  request: MarketSubscribeRequest,
): MarketSubscribeRequest | null {
  if (
    typeof request.chartId !== 'string' ||
    request.chartId.length === 0 ||
    typeof request.pair !== 'string' ||
    request.pair.length === 0 ||
    !isTimeframe(request.timeframe)
  ) {
    return null;
  }
  const normalized: MarketSubscribeRequest = {
    chartId: request.chartId,
    pair: request.pair.toUpperCase(),
    timeframe: request.timeframe,
  };
  if (request.limit !== undefined) {
    normalized.limit = normalizeCandleLimit(request.limit);
  }
  return normalized;
}

function normalizeHistoryRequest(
  request: MarketHistoryRequest,
): MarketHistoryRequest | null {
  if (
    typeof request.chartId !== 'string' ||
    request.chartId.length === 0 ||
    typeof request.pair !== 'string' ||
    request.pair.length === 0 ||
    !isTimeframe(request.timeframe) ||
    typeof request.beforeOpenTime !== 'number' ||
    !Number.isFinite(request.beforeOpenTime)
  ) {
    return null;
  }
  return {
    chartId: request.chartId,
    pair: request.pair.toUpperCase(),
    timeframe: request.timeframe,
    beforeOpenTime: Math.trunc(request.beforeOpenTime),
    limit: normalizeCandleLimit(request.limit),
  };
}

function marketRoom(pair: string, timeframe: Timeframe): string {
  return `market:${pair}:${timeframe}`;
}
