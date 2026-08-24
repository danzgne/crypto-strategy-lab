'use client';

import type {
  Candle,
  MarketCandleUpdate,
  MarketSnapshot,
  MarketSubscribeRequest,
  MarketSubscriptionStatus,
  Timeframe,
} from '@crypto-strategy-lab/shared';
import { normalizeCandleLimit } from '@crypto-strategy-lab/shared/market-data';
import { useEffect, useRef, useState } from 'react';

import {
  getRealtimeSocket,
  type AppSocket,
} from '../../../shared/realtime/socketClient';

export type MarketSubscriptionSocket = AppSocket;

export interface MarketSubscriptionState {
  candles: Candle[];
  phase: 'connecting' | 'live' | 'reconnecting' | 'stale';
  detail: string;
}

export interface UseMarketSubscriptionOptions {
  pair: string;
  timeframe: Timeframe;
  limit?: number;
  chartId?: string;
  socketFactory?: () => MarketSubscriptionSocket;
}

const INITIAL_STATE: MarketSubscriptionState = {
  candles: [],
  phase: 'connecting',
  detail: 'Requesting market history',
};

export function useMarketSubscription({
  pair,
  timeframe,
  limit = 500,
  chartId,
  socketFactory = getRealtimeSocket,
}: UseMarketSubscriptionOptions): MarketSubscriptionState {
  const [state, setState] = useState<MarketSubscriptionState>(INITIAL_STATE);
  const chartIdRef = useRef(chartId ?? createChartId());
  const socketFactoryRef = useRef(socketFactory);

  useEffect(() => {
    const socket = socketFactoryRef.current();
    let active = true;
    const activeChartId = chartIdRef.current;
    const request: MarketSubscribeRequest = {
      chartId: activeChartId,
      pair,
      timeframe,
      limit,
    };

    const handleConnect = (): void => {
      if (!active) return;
      setState((current) => ({
        ...current,
        phase: 'connecting',
        detail: 'Loading the latest market candles',
      }));
      socket.emit('market:subscribe', request);
    };
    const handleDisconnect = (): void => {
      if (!active) return;
      setState((current) => ({
        ...current,
        phase: 'reconnecting',
        detail: 'Market stream disconnected; reconnecting',
      }));
    };
    const handleConnectError = (): void => {
      if (!active) return;
      setState((current) => ({
        ...current,
        phase: 'reconnecting',
        detail: 'Market stream unavailable; retrying',
      }));
    };
    const handleSnapshot = (snapshot: MarketSnapshot): void => {
      if (
        !active ||
        snapshot.chartId !== activeChartId ||
        snapshot.pair !== pair ||
        snapshot.timeframe !== timeframe
      ) {
        return;
      }
      setState({
        candles: trimCandles(snapshot.candles, limit),
        phase: 'connecting',
        detail: 'Fresh market snapshot received; checking stream status',
      });
    };
    const handleCandle = (update: MarketCandleUpdate): void => {
      if (!active || update.pair !== pair || update.timeframe !== timeframe) {
        return;
      }
      setState((current) => ({
        ...current,
        candles: trimCandles(
          replaceCandle(current.candles, update.candle),
          limit,
        ),
        detail: update.candle.isClosed
          ? 'Latest candle closed'
          : 'Forming candle updating live',
      }));
    };
    const handleStatus = (status: MarketSubscriptionStatus): void => {
      if (!active || status.pair !== pair || status.timeframe !== timeframe) {
        return;
      }
      setState((current) => ({
        ...current,
        phase: statusToPhase(status),
        detail: status.detail ?? statusDetail(status.status),
      }));
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('market:snapshot', handleSnapshot);
    socket.on('market:candle', handleCandle);
    socket.on('market:status', handleStatus);

    if (socket.connected) {
      handleConnect();
    } else {
      socket.connect();
    }

    return () => {
      active = false;
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('market:snapshot', handleSnapshot);
      socket.off('market:candle', handleCandle);
      socket.off('market:status', handleStatus);
      if (socket.connected) {
        socket.emit('market:unsubscribe', {
          chartId: activeChartId,
          pair,
          timeframe,
        });
      }
    };
  }, [limit, pair, timeframe]);

  return state;
}

function replaceCandle(candles: Candle[], update: Candle): Candle[] {
  const byOpenTime = new Map(
    candles.map((candle) => [candle.openTime, candle]),
  );
  byOpenTime.set(update.openTime, update);
  return [...byOpenTime.values()];
}

function trimCandles(candles: Candle[], limit: number): Candle[] {
  return candles
    .slice()
    .sort((left, right) => left.openTime - right.openTime)
    .slice(-normalizeCandleLimit(limit));
}

function statusToPhase(
  status: MarketSubscriptionStatus,
): MarketSubscriptionState['phase'] {
  return status.status.toLowerCase() as MarketSubscriptionState['phase'];
}

function statusDetail(status: MarketSubscriptionStatus['status']): string {
  switch (status) {
    case 'LIVE':
      return 'Live market stream connected';
    case 'RECONNECTING':
      return 'Market stream reconnecting';
    case 'STALE':
      return 'Market stream is stale';
  }
}

function createChartId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `chart-${globalThis.crypto.randomUUID()}`;
  }
  return `chart-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
