'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { backtestClient, type BacktestClient } from '../api/backtestClient';
import type { BacktestHistoryItem } from '@crypto-strategy-lab/shared';

export interface UseBacktestHistoryOptions {
  client?: BacktestClient;
  pollIntervalMs?: number;
}

export interface BacktestHistoryState {
  items: BacktestHistoryItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useBacktestHistory({
  client = backtestClient,
  pollIntervalMs = 1_000,
}: UseBacktestHistoryOptions = {}): BacktestHistoryState {
  const clientRef = useRef(client);
  const mountedRef = useRef(true);
  const loadedRef = useRef(false);
  const requestInFlightRef = useRef(false);
  const [items, setItems] = useState<BacktestHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    const showLoading = !loadedRef.current;
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const nextItems = await clientRef.current.list();
      if (!mountedRef.current) return;
      setItems(nextItems);
      loadedRef.current = true;
    } catch (reason: unknown) {
      if (!mountedRef.current) return;
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to load backtest history',
      );
    } finally {
      requestInFlightRef.current = false;
      if (mountedRef.current && showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const timer = setInterval(() => void refresh(), pollIntervalMs);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [pollIntervalMs, refresh]);

  return { error, items, loading, refresh };
}
