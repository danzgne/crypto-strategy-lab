import type {
  ClientToServerEvents,
  CompositeStrategyRequest,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
  StrategySubscribeRequest,
  StrategyUnsubscribeRequest,
} from '@crypto-strategy-lab/shared';
import type { Request } from 'express';
import type { Server, Socket } from 'socket.io';

import type { AppLogger } from '../../../../utils/logger';
import type { StrategyLibraryService } from '../services/strategyLibraryService';
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

type SubscriptionsBySocket = Map<string, Map<string, StrategySubscription>>;

export function registerStrategyGateway(
  socketServer: StrategySocketServer,
  logger: AppLogger,
  strategyLiveService?: StrategyLiveService,
  strategyLibraryService?: StrategyLibraryService,
): void {
  const subscriptions: SubscriptionsBySocket = new Map();

  socketServer.on('connection', (socket) => {
    socket.on('strategy:subscribe', (request) => {
      void subscribeStrategy(
        socket,
        request,
        strategyLiveService,
        strategyLibraryService,
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
  strategyLibraryService: StrategyLibraryService | undefined,
  subscriptions: SubscriptionsBySocket,
  logger: AppLogger,
): Promise<void> {
  if (strategyLiveService === undefined || !isValidRequest(request)) return;
  await unsubscribeStrategy(
    socket,
    { chartId: request.chartId },
    subscriptions,
  );

  try {
    const resolved = await resolveSubscriptionTarget(
      socket,
      request,
      strategyLibraryService,
    );
    if (resolved === null) {
      socket.emit('strategy:error', {
        chartId: request.chartId,
        strategyId: request.strategyId ?? request.strategyVersionId ?? '',
        pair: request.pair.toUpperCase(),
        timeframe: request.timeframe,
        phase: 'validation',
        message: 'Strategy version not found',
      });
      return;
    }

    const subscription = await strategyLiveService.subscribe(
      {
        strategyId: resolved.strategyId,
        pair: request.pair,
        timeframe: request.timeframe,
        ...(request.limit === undefined ? {} : { limit: request.limit }),
        ...(resolved.params === undefined ? {} : { params: resolved.params }),
        ...(resolved.composite === undefined
          ? {}
          : { composite: resolved.composite }),
      },
      (update) => socket.emit('strategy:signal', update),
      (error) =>
        socket.emit('strategy:error', {
          chartId: request.chartId,
          strategyId: resolved.strategyId,
          pair: request.pair.toUpperCase(),
          timeframe: request.timeframe,
          phase: 'evaluation',
          message: error.message,
        }),
    );
    socket.emit('strategy:snapshot', {
      chartId: request.chartId,
      strategyId: resolved.strategyId,
      pair: request.pair.toUpperCase(),
      timeframe: request.timeframe,
      signals: subscription.history,
    });

    let socketSubscriptions = subscriptions.get(socket.id);
    if (socketSubscriptions === undefined) {
      socketSubscriptions = new Map();
      subscriptions.set(socket.id, socketSubscriptions);
    }
    socketSubscriptions.set(request.chartId, subscription);
  } catch (error) {
    logger.error(
      {
        err: error,
        socketId: socket.id,
        chartId: request.chartId,
        pair: request.pair,
        timeframe: request.timeframe,
      },
      'Strategy subscription failed',
    );
    socket.emit('strategy:error', {
      chartId: request.chartId,
      strategyId: request.strategyId ?? request.strategyVersionId ?? '',
      pair: request.pair.toUpperCase(),
      timeframe: request.timeframe,
      phase: 'validation',
      message:
        error instanceof Error ? error.message : 'Strategy subscription failed',
    });
  }
}

interface ResolvedSubscriptionTarget {
  strategyId: string;
  params?: unknown;
  composite?: CompositeStrategyRequest;
}

async function resolveSubscriptionTarget(
  socket: StrategySocket,
  request: StrategySubscribeRequest,
  strategyLibraryService: StrategyLibraryService | undefined,
): Promise<ResolvedSubscriptionTarget | null> {
  if (request.strategyVersionId === undefined) {
    return request.composite === undefined
      ? { strategyId: request.strategyId, params: request.params }
      : { strategyId: 'composite', composite: request.composite };
  }

  if (strategyLibraryService === undefined) return null;
  const ownerId = socketOwnerId(socket);
  if (ownerId === undefined) return null;

  const version = await strategyLibraryService.findVersionForOwner(
    ownerId,
    request.strategyVersionId,
  );
  if (version === null) return null;

  return version.strategyId === 'composite'
    ? {
        strategyId: 'composite',
        composite: version.params as CompositeStrategyRequest,
      }
    : { strategyId: version.strategyId, params: version.params };
}

function socketOwnerId(socket: StrategySocket): string | undefined {
  return (socket.request as Request & { session?: { userId?: string } }).session
    ?.userId;
}

async function unsubscribeStrategy(
  socket: StrategySocket,
  request: StrategyUnsubscribeRequest,
  subscriptions: SubscriptionsBySocket,
): Promise<void> {
  const socketSubscriptions = subscriptions.get(socket.id);
  const active = socketSubscriptions?.get(request.chartId);
  if (active === undefined) return;
  socketSubscriptions?.delete(request.chartId);
  if (socketSubscriptions?.size === 0) subscriptions.delete(socket.id);
  await active.unsubscribe();
}

async function unsubscribeAll(
  socket: StrategySocket,
  subscriptions: SubscriptionsBySocket,
): Promise<void> {
  const socketSubscriptions = subscriptions.get(socket.id);
  if (socketSubscriptions === undefined) return;
  subscriptions.delete(socket.id);
  await Promise.all(
    [...socketSubscriptions.values()].map((subscription) =>
      subscription.unsubscribe(),
    ),
  );
}

function isValidRequest(request: StrategySubscribeRequest): boolean {
  return (
    typeof request.chartId === 'string' &&
    request.chartId.length > 0 &&
    typeof request.pair === 'string' &&
    request.pair.length > 0 &&
    typeof request.timeframe === 'string' &&
    (request.strategyVersionId !== undefined ||
      (typeof request.strategyId === 'string' &&
        request.strategyId.length > 0 &&
        (request.strategyId === 'composite'
          ? request.composite !== undefined
          : request.composite === undefined)))
  );
}
