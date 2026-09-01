'use client';

import type { LibraryBuiltin, LibraryEntry } from '@crypto-strategy-lab/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  strategyLibraryClient,
  type StrategyLibraryClient,
} from '../api/strategyLibraryClient';

const PAGE_SIZE = 20;

export interface StrategyLibraryState {
  builtins: LibraryBuiltin[];
  entries: LibraryEntry[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  showArchived: boolean;
  setShowArchived: (value: boolean) => void;
  loadMore: () => void;
  refresh: () => void;
}

export interface UseStrategyLibraryOptions {
  client?: StrategyLibraryClient;
}

export function useStrategyLibrary({
  client = strategyLibraryClient,
}: UseStrategyLibraryOptions = {}): StrategyLibraryState {
  const clientRef = useRef(client);
  const [builtins, setBuiltins] = useState<LibraryBuiltin[]>([]);
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const requestSequence = useRef(0);

  const load = useCallback(
    async (offset: number, append: boolean) => {
      const sequence = ++requestSequence.current;
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const result = await clientRef.current.list({
          limit: PAGE_SIZE,
          offset,
          archived: showArchived,
        });
        if (sequence !== requestSequence.current) return;
        setBuiltins(result.builtins);
        setEntries((current) =>
          append ? [...current, ...result.entries] : result.entries,
        );
        setTotal(result.total);
        setError(null);
      } catch (reason: unknown) {
        if (sequence !== requestSequence.current) return;
        setError(
          reason instanceof Error
            ? reason.message
            : 'Unable to load the strategy library',
        );
      } finally {
        if (sequence === requestSequence.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [showArchived],
  );

  useEffect(() => {
    void (async () => {
      await load(0, false);
    })();
  }, [load]);

  const loadMore = useCallback(() => {
    load(entries.length, true);
  }, [entries.length, load]);

  const refresh = useCallback(() => {
    load(0, false);
  }, [load]);

  return {
    builtins,
    entries,
    total,
    loading,
    loadingMore,
    error,
    hasMore: entries.length < total,
    showArchived,
    setShowArchived,
    loadMore,
    refresh,
  };
}
