import type {
  ClientToServerEvents,
  InterServerEvents,
  MarketSubscribeRequest,
  MarketUnsubscribeRequest,
  ServerToClientEvents,
  SocketData,
  Timeframe,
} from '@crypto-strategy-lab/shared';
import type { Server, Socket } from 'socket.io';

import type { AppLogger } from '../../../../utils/logger';
import type {
  MarketDataService,
  MarketDataSubscription,
} from '../application/services/marketDataService';

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
  rootAssigned: boolean;
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
): void {
  const roomStates = new Map<string, RoomState>();
  const clientSubscriptions = new Map<
    string,
    Map<string, ClientSubscription>
  >();

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

    socket.on('market:subscribe', (request) => {
      void subscribeSocket(
        socket,
        request,
        marketDataService,
        roomStates,
        clientSubscriptions,
        logger,
        socketServer,
      );
    });

    socket.on('market:unsubscribe', (request) => {
      void unsubscribeSocket(
        socket,
        request,
        roomStates,
        clientSubscriptions,
        logger,
      );
    });

    socket.on('disconnect', (reason) => {
      void unsubscribeAll(socket, roomStates, clientSubscriptions, logger);
      logger.info(
        { socketId: socket.id, reason },
        'Realtime client disconnected',
      );
    });
  });
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
      rootAssigned: false,
      ready: Promise.resolve(),
    };
    roomStates.set(roomKey, roomState);
    roomState.ready = initializeRoom(
      roomState,
      normalizedRequest,
      marketDataService,
      socketServer,
    );
  }

  try {
    await roomState.ready;
    const subscription = roomState.rootAssigned
      ? await marketDataService.subscribe(normalizedRequest)
      : takeRootSubscription(roomState);

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
    socket.emit('market:status', {
      pair: normalizedRequest.pair,
      timeframe: normalizedRequest.timeframe,
      status: roomState.status,
    });
  } catch (error) {
    await socket.leave(room);
    if (roomStates.get(roomKey) === roomState) roomStates.delete(roomKey);
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
    });
  }
}

async function initializeRoom(
  roomState: RoomState,
  request: MarketSubscribeRequest,
  marketDataService: MarketDataService,
  socketServer: MarketDataSocketServer,
): Promise<void> {
  const subscription = await marketDataService.subscribe(request, {
    onCandle: (candle) => {
      socketServer.to(roomState.room).emit('market:candle', {
        pair: roomState.pair,
        timeframe: roomState.timeframe,
        candle,
      });
    },
    onStatus: (status) => {
      roomState.status = status;
      socketServer.to(roomState.room).emit('market:status', {
        pair: roomState.pair,
        timeframe: roomState.timeframe,
        status,
      });
    },
  });
  roomState.rootSubscription = subscription;
  roomState.status = 'LIVE';
}

function takeRootSubscription(roomState: RoomState): MarketDataSubscription {
  if (roomState.rootAssigned || roomState.rootSubscription === undefined) {
    throw new Error('Market room root subscription was already assigned');
  }
  roomState.rootAssigned = true;
  return roomState.rootSubscription;
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
    normalized.limit = Math.min(1_000, Math.max(1, Math.trunc(request.limit)));
  }
  return normalized;
}

function isTimeframe(value: string): value is Timeframe {
  return ['1m', '5m', '15m', '1h', '4h', '1d'].includes(value);
}

function marketRoom(pair: string, timeframe: Timeframe): string {
  return `market:${pair}:${timeframe}`;
}
