'use client';

import type {
  CompositeStrategyRequest,
  StrategyErrorEvent,
  StrategySignalSnapshot,
  StrategySignalUpdate,
  StrategySubscribeRequest,
  Timeframe,
} from '@crypto-strategy-lab/shared';
import { useEffect, useRef, useState } from 'react';

import {
  getRealtimeSocket,
  type AppSocket,
} from '../../../shared/realtime/socketClient';

export type StrategySignalSocket = AppSocket;

export interface StrategySignalState {
  latest: StrategySignalUpdate | null;
  history: StrategySignalUpdate[];
  error: string | null;
}

export interface UseStrategySignalOptions {
  chartId: string;
  pair: string;
  timeframe: Timeframe;
  strategyId: string | null;
  strategyVersionId?: string;
  enabled: boolean;
  limit?: number;
  params?: unknown;
  composite?: CompositeStrategyRequest;
  socketFactory?: () => StrategySignalSocket;
}

const INITIAL_STATE: StrategySignalState = {
  latest: null,
  history: [],
  error: null,
};

export function useStrategySignal({
  chartId,
  pair,
  timeframe,
  strategyId,
  strategyVersionId,
  enabled,
  limit = 500,
  params,
  composite,
  socketFactory = getRealtimeSocket,
}: UseStrategySignalOptions): StrategySignalState {
  const subscriptionKey = createSubscriptionKey({
    chartId,
    enabled,
    limit,
    pair,
    ...(params === undefined ? {} : { params }),
    ...(composite === undefined ? {} : { composite }),
    strategyId,
    ...(strategyVersionId === undefined ? {} : { strategyVersionId }),
    timeframe,
  });
  const [state, setState] = useState<StrategySignalState & { key: string }>(
    () => ({ ...INITIAL_STATE, key: subscriptionKey }),
  );
  const socketFactoryRef = useRef(socketFactory);

  useEffect(() => {
    if (!enabled) return;

    const socket = socketFactoryRef.current();
    let active = true;
    const request: StrategySubscribeRequest | null =
      strategyVersionId !== undefined
        ? { chartId, pair, timeframe, strategyVersionId, limit }
        : composite !== undefined
          ? {
              chartId,
              pair,
              timeframe,
              strategyId: 'composite',
              limit,
              composite,
            }
          : strategyId === null
            ? null
            : {
                chartId,
                pair,
                timeframe,
                strategyId,
                limit,
                ...(params === undefined ? {} : { params }),
              };
    if (request === null) return;

    const subscribe = (): void => {
      if (!active) return;
      socket.emit('strategy:subscribe', request);
    };
    const handleSignal = (update: StrategySignalUpdate): void => {
      if (!active || update.pair !== pair || update.timeframe !== timeframe) {
        return;
      }
      setState((current) => ({
        key: subscriptionKey,
        latest: update,
        history:
          current.key === subscriptionKey
            ? upsertSignalHistory(current.history, update, limit)
            : [update],
        error: null,
      }));
    };
    const handleSnapshot = (snapshot: StrategySignalSnapshot): void => {
      if (
        !active ||
        snapshot.chartId !== chartId ||
        snapshot.pair !== pair ||
        snapshot.timeframe !== timeframe
      ) {
        return;
      }
      const history = snapshot.signals
        .slice()
        .sort((left, right) => left.candle.openTime - right.candle.openTime)
        .slice(-Math.max(1, Math.trunc(limit)));
      setState((current) => ({
        key: subscriptionKey,
        latest: history.at(-1) ?? null,
        history,
        error: current.key === subscriptionKey ? current.error : null,
      }));
    };
    const handleError = (error: StrategyErrorEvent): void => {
      if (
        !active ||
        error.phase !== 'evaluation' ||
        error.chartId !== chartId ||
        error.pair !== pair ||
        error.timeframe !== timeframe
      ) {
        return;
      }
      setState({
        key: subscriptionKey,
        latest: null,
        history: [],
        error: error.message,
      });
    };

    socket.on('connect', subscribe);
    socket.on('strategy:snapshot', handleSnapshot);
    socket.on('strategy:signal', handleSignal);
    socket.on('strategy:error', handleError);
    if (socket.connected) {
      subscribe();
    } else {
      socket.connect();
    }

    return () => {
      active = false;
      socket.off('connect', subscribe);
      socket.off('strategy:snapshot', handleSnapshot);
      socket.off('strategy:signal', handleSignal);
      socket.off('strategy:error', handleError);
      if (socket.connected) {
        socket.emit('strategy:unsubscribe', { chartId });
      }
    };
  }, [
    chartId,
    composite,
    enabled,
    limit,
    pair,
    params,
    strategyId,
    strategyVersionId,
    subscriptionKey,
    timeframe,
  ]);

  if (state.key !== subscriptionKey) return INITIAL_STATE;
  return {
    latest: state.latest,
    history: state.history,
    error: state.error,
  };
}

function createSubscriptionKey({
  chartId,
  enabled,
  limit,
  pair,
  params,
  composite,
  strategyId,
  strategyVersionId,
  timeframe,
}: Pick<
  UseStrategySignalOptions,
  | 'chartId'
  | 'composite'
  | 'enabled'
  | 'limit'
  | 'pair'
  | 'params'
  | 'strategyId'
  | 'strategyVersionId'
  | 'timeframe'
>): string {
  return `${chartId}:${pair}:${timeframe}:${strategyId}:${strategyVersionId ?? ''}:${enabled}:${limit}:${JSON.stringify(params ?? null)}:${JSON.stringify(composite ?? null)}`;
}

function upsertSignalHistory(
  history: StrategySignalUpdate[],
  update: StrategySignalUpdate,
  limit: number,
): StrategySignalUpdate[] {
  const byOpenTime = new Map(
    history.map((signal) => [signal.candle.openTime, signal]),
  );
  byOpenTime.set(update.candle.openTime, update);
  return [...byOpenTime.values()]
    .sort((left, right) => left.candle.openTime - right.candle.openTime)
    .slice(-Math.max(1, Math.trunc(limit)));
}
