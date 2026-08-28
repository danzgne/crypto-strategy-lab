import type {
  ClientToServerEvents,
  InterServerEvents,
  MarketTickUpdate,
  MarketTicksSubscribeRequest,
  MarketTicksUnsubscribeRequest,
  ServerToClientEvents,
  SocketData,
} from '@crypto-strategy-lab/shared';
import { normalizeTickLimit } from '@crypto-strategy-lab/shared';
import type { Server, Socket } from 'socket.io';

import type { AppLogger } from '@/utils/logger';
import type {
  MarketTickService,
  MarketTickSubscription,
} from '../application/services/marketTickService';

type MarketTickSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type MarketTickSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

interface TickRoomState {
  room: string;
  pair: string;
  memberCount: number;
  snapshotSent: boolean;
  rootSubscription?: MarketTickSubscription;
  ready: Promise<void>;
}

interface ClientTickSubscription {
  room: string;
  pair: string;
  subscription: MarketTickSubscription;
}

export function registerMarketTickGateway(
  socketServer: MarketTickSocketServer,
  logger: AppLogger,
  marketTickService?: MarketTickService,
): void {
  const roomStates = new Map<string, TickRoomState>();
  const clientSubscriptions = new Map<
    string,
    Map<string, ClientTickSubscription>
  >();

  socketServer.on('connection', (socket) => {
    const subscriptionQueues = new Map<string, Promise<void>>();

    const enqueueSubscriptionOperation = (
      pair: string,
      operation: () => Promise<void>,
    ): void => {
      const queueKey = pair.trim().toUpperCase();
      const previous = subscriptionQueues.get(queueKey) ?? Promise.resolve();
      const next = previous
        .then(operation, operation)
        .catch((error: unknown) => {
          logger.error(
            { err: error, pair: queueKey, socketId: socket.id },
            'Market tick subscription operation failed',
          );
        });
      subscriptionQueues.set(queueKey, next);
      void next.finally(() => {
        if (subscriptionQueues.get(queueKey) === next) {
          subscriptionQueues.delete(queueKey);
        }
      });
    };

    socket.on('market:ticks:subscribe', (request) => {
      enqueueSubscriptionOperation(request.pair, () =>
        subscribeSocket(
          socket,
          request,
          marketTickService,
          roomStates,
          clientSubscriptions,
          logger,
          socketServer,
        ),
      );
    });

    socket.on('market:ticks:unsubscribe', (request) => {
      enqueueSubscriptionOperation(request.pair, () =>
        unsubscribeSocket(
          socket,
          request,
          roomStates,
          clientSubscriptions,
          logger,
        ),
      );
    });

    socket.on('disconnect', () => {
      void Promise.all([...subscriptionQueues.values()])
        .then(() =>
          unsubscribeAll(socket, roomStates, clientSubscriptions, logger),
        )
        .catch((error: unknown) => {
          logger.error(
            { err: error, socketId: socket.id },
            'Market tick subscriptions could not be released',
          );
        })
        .finally(() => subscriptionQueues.clear());
    });
  });
}

async function subscribeSocket(
  socket: MarketTickSocket,
  request: MarketTicksSubscribeRequest,
  marketTickService: MarketTickService | undefined,
  roomStates: Map<string, TickRoomState>,
  clientSubscriptions: Map<string, Map<string, ClientTickSubscription>>,
  logger: AppLogger,
  socketServer: MarketTickSocketServer,
): Promise<void> {
  const normalizedRequest = normalizeSubscribeRequest(request);
  if (normalizedRequest === null || marketTickService === undefined) {
    emitEmptySnapshot(socket, request);
    return;
  }

  await unsubscribeSocket(
    socket,
    { pair: normalizedRequest.pair },
    roomStates,
    clientSubscriptions,
    logger,
  );

  const room = marketTickRoom(normalizedRequest.pair);
  await socket.join(room);

  let roomState = roomStates.get(room);
  if (roomState === undefined) {
    roomState = {
      room,
      pair: normalizedRequest.pair,
      memberCount: 0,
      snapshotSent: false,
      ready: Promise.resolve(),
    };
    roomStates.set(room, roomState);
    roomState.ready = initializeRoom(
      roomState,
      normalizedRequest,
      marketTickService,
      roomStates,
      socketServer,
    );
  }

  try {
    await roomState.ready;
    const subscription = await marketTickService.subscribe(normalizedRequest);

    roomState.memberCount += 1;
    let subscriptions = clientSubscriptions.get(socket.id);
    if (subscriptions === undefined) {
      subscriptions = new Map();
      clientSubscriptions.set(socket.id, subscriptions);
    }
    subscriptions.set(normalizedRequest.pair, {
      room,
      pair: normalizedRequest.pair,
      subscription,
    });

    socket.emit('market:ticks:snapshot', {
      pair: normalizedRequest.pair,
      ticks: subscription.ticks,
    });
    roomState.snapshotSent = true;
  } catch (error) {
    await socket.leave(room);
    if (roomStates.get(room) === roomState) {
      roomStates.delete(room);
      await roomState.rootSubscription?.unsubscribe();
    }
    logger.error(
      { err: error, socketId: socket.id, pair: normalizedRequest.pair },
      'Market tick subscription failed',
    );
    socket.emit('market:ticks:snapshot', {
      pair: normalizedRequest.pair,
      ticks: [],
    });
  }
}

async function initializeRoom(
  roomState: TickRoomState,
  request: MarketTicksSubscribeRequest,
  marketTickService: MarketTickService,
  roomStates: Map<string, TickRoomState>,
  socketServer: MarketTickSocketServer,
): Promise<void> {
  const subscription = await marketTickService.subscribe(request, {
    onTick: (tick) => {
      if (roomStates.get(roomState.room) !== roomState) return;
      if (!roomState.snapshotSent) return;
      const update: MarketTickUpdate = {
        pair: roomState.pair,
        tick,
      };
      socketServer.to(roomState.room).emit('market:tick', update);
    },
  });
  roomState.rootSubscription = subscription;
}

async function unsubscribeSocket(
  socket: MarketTickSocket,
  request: MarketTicksUnsubscribeRequest,
  roomStates: Map<string, TickRoomState>,
  clientSubscriptions: Map<string, Map<string, ClientTickSubscription>>,
  logger: AppLogger,
): Promise<void> {
  const pair = normalizePair(request.pair);
  if (pair === null) return;

  const subscriptions = clientSubscriptions.get(socket.id);
  const clientSubscription = subscriptions?.get(pair);
  if (clientSubscription === undefined) return;

  subscriptions?.delete(pair);
  if (subscriptions?.size === 0) clientSubscriptions.delete(socket.id);
  await clientSubscription.subscription.unsubscribe();

  const stillSubscribedToRoom = [...(subscriptions?.values() ?? [])].some(
    (subscription) => subscription.room === clientSubscription.room,
  );
  if (!stillSubscribedToRoom) await socket.leave(clientSubscription.room);

  const roomState = roomStates.get(clientSubscription.room);
  if (roomState === undefined) return;
  roomState.memberCount = Math.max(0, roomState.memberCount - 1);
  if (roomState.memberCount > 0) return;
  roomStates.delete(clientSubscription.room);
  await roomState.rootSubscription?.unsubscribe();
  logger.debug({ room: clientSubscription.room }, 'Market tick room released');
}

async function unsubscribeAll(
  socket: MarketTickSocket,
  roomStates: Map<string, TickRoomState>,
  clientSubscriptions: Map<string, Map<string, ClientTickSubscription>>,
  logger: AppLogger,
): Promise<void> {
  const subscriptions = clientSubscriptions.get(socket.id);
  if (subscriptions === undefined) return;
  const requests = [...subscriptions.keys()].map(
    (pair): MarketTicksUnsubscribeRequest => ({ pair }),
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
  request: MarketTicksSubscribeRequest,
): MarketTicksSubscribeRequest | null {
  const pair = normalizePair(request.pair);
  if (pair === null) return null;
  return {
    pair,
    limit: normalizeTickLimit(request.limit),
  };
}

function normalizePair(pair: string): string | null {
  const normalized = pair.trim().toUpperCase();
  return normalized.length === 0 ? null : normalized;
}

function marketTickRoom(pair: string): string {
  return `market:ticks:${pair}`;
}

function emitEmptySnapshot(
  socket: MarketTickSocket,
  request: MarketTicksSubscribeRequest,
): void {
  const pair = normalizePair(request.pair);
  if (pair === null) return;
  socket.emit('market:ticks:snapshot', { pair, ticks: [] });
}
