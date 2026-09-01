'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { backtestClient, type BacktestClient } from '../api/backtestClient';
import type { BacktestHistoryItem } from '@crypto-strategy-lab/shared';

export interface UseBacktestHistoryOptions {
  client?: BacktestClient;
}

export interface BacktestHistoryState {
  items: BacktestHistoryItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useBacktestHistory({
  client = backtestClient,
}: UseBacktestHistoryOptions = {}): BacktestHistoryState {
  const clientRef = useRef(client);
  const mountedRef = useRef(true);
  const [items, setItems] = useState<BacktestHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const nextItems = await clientRef.current.list();
      if (!mountedRef.current) return;
      setItems(nextItems);
    } catch (reason: unknown) {
      if (!mountedRef.current) return;
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to load backtest history',
      );
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void clientRef.current
      .list()
      .then((nextItems) => {
        if (!mountedRef.current) return;
        setItems(nextItems);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!mountedRef.current) return;
        setError(
          reason instanceof Error
            ? reason.message
            : 'Unable to load backtest history',
        );
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  return { error, items, loading, refresh };
}
