'use client';

import type {
  MarketTickUpdate,
  MarketTicksSnapshot,
  Tick,
} from '@crypto-strategy-lab/shared';
import { normalizeTickLimit } from '@crypto-strategy-lab/shared/market-data/tick';
import { useEffect, useRef, useState } from 'react';

import {
  getRealtimeSocket,
  type AppSocket,
} from '../../../shared/realtime/socketClient';

export type RecentTicksSocket = AppSocket;

export interface RecentTicksState {
  ticks: Tick[];
  loading: boolean;
  detail: string;
}

export interface UseRecentTicksOptions {
  pair: string;
  limit?: number;
  socketFactory?: () => RecentTicksSocket;
}

interface InternalRecentTicksState extends RecentTicksState {
  key: string;
}

const DEFAULT_DISPLAY_LIMIT = 5;
const INITIAL_STATE: RecentTicksState = {
  ticks: [],
  loading: true,
  detail: 'Waiting for recent trade events',
};

export function useRecentTicks({
  pair,
  limit = DEFAULT_DISPLAY_LIMIT,
  socketFactory = getRealtimeSocket,
}: UseRecentTicksOptions): RecentTicksState {
  const normalizedPair = pair.trim().toUpperCase();
  const normalizedLimit = normalizeTickLimit(limit);
  const subscriptionKey = `${normalizedPair}:${normalizedLimit}`;
  const [state, setState] = useState<InternalRecentTicksState>(() => ({
    ...INITIAL_STATE,
    key: subscriptionKey,
  }));
  const socketFactoryRef = useRef(socketFactory);
  const ticksRef = useRef<Tick[]>([]);

  useEffect(() => {
    const socket = socketFactoryRef.current();
    let active = true;
    ticksRef.current = [];

    const updateState = (update: RecentTicksState): void => {
      setState({ ...update, key: subscriptionKey });
    };
    const request = { pair: normalizedPair, limit: normalizedLimit };

    const handleConnect = (): void => {
      if (!active) return;
      updateState({
        ticks: ticksRef.current,
        loading: true,
        detail: 'Subscribing to recent trade events',
      });
      socket.emit('market:ticks:subscribe', request);
    };
    const handleDisconnect = (): void => {
      if (!active) return;
      updateState({
        ticks: ticksRef.current,
        loading: true,
        detail: 'Trade stream disconnected; reconnecting',
      });
    };
    const handleSnapshot = (snapshot: MarketTicksSnapshot): void => {
      if (!active || snapshot.pair !== normalizedPair) return;
      const ticks = mergeTicks([], snapshot.ticks, normalizedLimit);
      ticksRef.current = ticks;
      updateState({
        ticks,
        loading: false,
        detail:
          ticks.length === 0
            ? 'No recent trade events received'
            : 'Recent trade events updating live',
      });
    };
    const handleTick = (update: MarketTickUpdate): void => {
      if (!active || update.pair !== normalizedPair) return;
      const ticks = mergeTicks(
        ticksRef.current,
        [update.tick],
        normalizedLimit,
      );
      ticksRef.current = ticks;
      updateState({
        ticks,
        loading: false,
        detail: 'Recent trade events updating live',
      });
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('market:ticks:snapshot', handleSnapshot);
    socket.on('market:tick', handleTick);

    if (socket.connected) {
      handleConnect();
    } else {
      socket.connect();
    }

    return () => {
      active = false;
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('market:ticks:snapshot', handleSnapshot);
      socket.off('market:tick', handleTick);
      if (socket.connected) {
        socket.emit('market:ticks:unsubscribe', { pair: normalizedPair });
      }
    };
  }, [normalizedLimit, normalizedPair, subscriptionKey]);

  if (state.key !== subscriptionKey) return INITIAL_STATE;
  return state;
}

function mergeTicks(
  currentTicks: readonly Tick[],
  nextTicks: readonly Tick[],
  limit: number,
): Tick[] {
  const byTradeId = new Map<string, Tick>();
  for (const tick of [...currentTicks, ...nextTicks]) {
    byTradeId.set(tick.tradeId, tick);
  }
  return [...byTradeId.values()]
    .sort((left, right) => right.time - left.time)
    .slice(0, limit);
}
