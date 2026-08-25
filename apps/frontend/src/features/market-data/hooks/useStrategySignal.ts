'use client';

import type {
  StrategySignalUpdate,
  StrategySubscribeRequest,
  StrategyUnsubscribeRequest,
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
}

export interface UseStrategySignalOptions {
  chartId: string;
  pair: string;
  timeframe: Timeframe;
  strategyId: string;
  enabled: boolean;
  limit?: number;
  socketFactory?: () => StrategySignalSocket;
}

const INITIAL_STATE: StrategySignalState = {
  latest: null,
  history: [],
};

export function useStrategySignal({
  chartId,
  pair,
  timeframe,
  strategyId,
  enabled,
  limit = 500,
  socketFactory = getRealtimeSocket,
}: UseStrategySignalOptions): StrategySignalState {
  const subscriptionKey = createSubscriptionKey({
    chartId,
    enabled,
    limit,
    pair,
    strategyId,
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
    const request: StrategySubscribeRequest = {
      chartId,
      pair,
      timeframe,
      strategyId,
    };

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
      }));
    };

    socket.on('connect', subscribe);
    socket.on('strategy:signal', handleSignal);
    if (socket.connected) {
      subscribe();
    } else {
      socket.connect();
    }

    return () => {
      active = false;
      socket.off('connect', subscribe);
      socket.off('strategy:signal', handleSignal);
      if (socket.connected) {
        const unsubscribe: StrategyUnsubscribeRequest = request;
        socket.emit('strategy:unsubscribe', unsubscribe);
      }
    };
  }, [chartId, enabled, limit, pair, strategyId, subscriptionKey, timeframe]);

  if (state.key !== subscriptionKey) return INITIAL_STATE;
  return {
    latest: state.latest,
    history: state.history,
  };
}

function createSubscriptionKey({
  chartId,
  enabled,
  limit,
  pair,
  strategyId,
  timeframe,
}: Pick<
  UseStrategySignalOptions,
  'chartId' | 'enabled' | 'limit' | 'pair' | 'strategyId' | 'timeframe'
>): string {
  return `${chartId}:${pair}:${timeframe}:${strategyId}:${enabled}:${limit}`;
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
