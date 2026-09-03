'use client';

import type {
  Candle,
  MarketCandleUpdate,
  MarketHistorySnapshot,
  MarketSnapshot,
  MarketSubscribeRequest,
  MarketSubscriptionStatus,
  Timeframe,
} from '@crypto-strategy-lab/shared';
import {
  MAX_CANDLE_LIMIT,
  normalizeCandleLimit,
} from '@crypto-strategy-lab/shared/market-data';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getRealtimeSocket,
  type AppSocket,
} from '../../../shared/realtime/socketClient';

export type MarketSubscriptionSocket = AppSocket;

export interface MarketSubscriptionState {
  candles: Candle[];
  phase: 'connecting' | 'live' | 'reconnecting' | 'stale';
  detail: string;
  historyLoading: boolean;
  hasMoreHistory: boolean;
}

export interface MarketSubscriptionResult extends MarketSubscriptionState {
  requestOlderHistory(): void;
}

interface InternalMarketSubscriptionState extends MarketSubscriptionState {
  key: string;
}

const HISTORY_PAGE_LIMIT = 250;

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
  historyLoading: false,
  hasMoreHistory: true,
};

export function useMarketSubscription({
  pair,
  timeframe,
  limit = 500,
  chartId,
  socketFactory = getRealtimeSocket,
}: UseMarketSubscriptionOptions): MarketSubscriptionResult {
  const subscriptionKey = createSubscriptionKey(pair, timeframe, limit);
  const [state, setState] = useState<InternalMarketSubscriptionState>(() => ({
    ...INITIAL_STATE,
    key: subscriptionKey,
  }));
  const chartIdRef = useRef(chartId ?? createChartId());
  const socketFactoryRef = useRef(socketFactory);
  const candlesRef = useRef<Candle[]>([]);
  const historyLoadingRef = useRef(false);
  const hasMoreHistoryRef = useRef(true);
  const requestOlderHistoryRef = useRef<(() => void) | null>(null);
  const requestOlderHistory = useCallback(() => {
    requestOlderHistoryRef.current?.();
  }, []);

  useEffect(() => {
    const socket = socketFactoryRef.current();
    let active = true;
    const activeChartId = chartIdRef.current;
    candlesRef.current = [];
    historyLoadingRef.current = false;
    hasMoreHistoryRef.current = true;
    const updateState = (
      update: (current: MarketSubscriptionState) => MarketSubscriptionState,
    ): void => {
      setState((current) => ({
        ...update(current),
        key: subscriptionKey,
      }));
    };
    const request: MarketSubscribeRequest = {
      chartId: activeChartId,
      pair,
      timeframe,
      limit,
    };

    const handleConnect = (): void => {
      if (!active) return;
      updateState((current) => ({
        ...current,
        phase: 'connecting',
        detail: 'Loading the latest market candles',
      }));
      socket.emit('market:subscribe', request);
    };
    const handleDisconnect = (): void => {
      if (!active) return;
      updateState((current) => ({
        ...current,
        phase: 'reconnecting',
        detail: 'Market stream disconnected; reconnecting',
        historyLoading: false,
      }));
      historyLoadingRef.current = false;
    };
    const handleConnectError = (): void => {
      if (!active) return;
      updateState((current) => ({
        ...current,
        phase: 'reconnecting',
        detail: 'Market stream unavailable; retrying',
        historyLoading: false,
      }));
      historyLoadingRef.current = false;
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
      const nextCandles = trimCandles(snapshot.candles, limit);
      candlesRef.current = nextCandles;
      historyLoadingRef.current = false;
      hasMoreHistoryRef.current = true;
      updateState(() => ({
        candles: nextCandles,
        phase: 'connecting',
        detail: 'Fresh market snapshot received; checking stream status',
        historyLoading: false,
        hasMoreHistory: true,
      }));
    };
    const handleHistory = (snapshot: MarketHistorySnapshot): void => {
      if (
        !active ||
        snapshot.chartId !== activeChartId ||
        snapshot.pair !== pair ||
        snapshot.timeframe !== timeframe
      ) {
        return;
      }
      const nextCandles = mergeCandles(candlesRef.current, snapshot.candles);
      const hasMoreHistory =
        snapshot.hasMore && nextCandles.length < MAX_CANDLE_LIMIT;
      candlesRef.current = nextCandles;
      historyLoadingRef.current = false;
      hasMoreHistoryRef.current = hasMoreHistory;
      updateState((current) => ({
        ...current,
        candles: nextCandles,
        detail:
          snapshot.candles.length === 0
            ? 'No older market history available'
            : 'Older market history loaded',
        historyLoading: false,
        hasMoreHistory,
      }));
    };
    const handleCandle = (update: MarketCandleUpdate): void => {
      if (!active || update.pair !== pair || update.timeframe !== timeframe) {
        return;
      }
      const nextCandles = trimCandles(
        replaceCandle(candlesRef.current, update.candle),
        MAX_CANDLE_LIMIT,
      );
      candlesRef.current = nextCandles;
      updateState((current) => ({
        ...current,
        candles: nextCandles,
        // A candle tick is direct proof of a live stream, overriding any stale status.
        phase: 'live',
        detail: update.candle.isClosed
          ? 'Latest candle closed'
          : 'Forming candle updating live',
      }));
    };
    const handleStatus = (status: MarketSubscriptionStatus): void => {
      if (
        !active ||
        status.pair !== pair ||
        status.timeframe !== timeframe ||
        (status.chartId !== undefined && status.chartId !== activeChartId)
      ) {
        return;
      }
      updateState((current) => ({
        ...current,
        phase: statusToPhase(status),
        detail: status.detail ?? statusDetail(status.status),
      }));
    };

    const requestOlderHistoryForSubscription = (): void => {
      if (
        !active ||
        !socket.connected ||
        historyLoadingRef.current ||
        !hasMoreHistoryRef.current
      ) {
        return;
      }
      const oldestCandle = candlesRef.current.at(0);
      if (oldestCandle === undefined) return;

      historyLoadingRef.current = true;
      updateState((current) => ({
        ...current,
        detail: 'Loading older market history',
        historyLoading: true,
      }));
      socket.emit('market:history:request', {
        chartId: activeChartId,
        pair,
        timeframe,
        beforeOpenTime: oldestCandle.openTime,
        limit: HISTORY_PAGE_LIMIT,
      });
    };
    requestOlderHistoryRef.current = requestOlderHistoryForSubscription;

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('market:snapshot', handleSnapshot);
    socket.on('market:history', handleHistory);
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
      socket.off('market:history', handleHistory);
      socket.off('market:candle', handleCandle);
      socket.off('market:status', handleStatus);
      requestOlderHistoryRef.current = null;
      if (socket.connected) {
        socket.emit('market:unsubscribe', {
          chartId: activeChartId,
          pair,
          timeframe,
        });
      }
    };
  }, [limit, pair, subscriptionKey, timeframe]);

  if (state.key !== subscriptionKey) {
    return { ...INITIAL_STATE, requestOlderHistory };
  }
  return { ...state, requestOlderHistory };
}

function createSubscriptionKey(
  pair: string,
  timeframe: Timeframe,
  limit: number,
): string {
  return `${pair}:${timeframe}:${limit}`;
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

function mergeCandles(
  currentCandles: Candle[],
  additionalCandles: Candle[],
): Candle[] {
  return trimCandles(
    [...currentCandles, ...additionalCandles],
    MAX_CANDLE_LIMIT,
  );
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
