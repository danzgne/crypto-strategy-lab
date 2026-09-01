'use client';

import type { LibraryEntryDetail } from '@crypto-strategy-lab/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  strategyLibraryClient,
  type StrategyLibraryClient,
} from '../api/strategyLibraryClient';

export interface LibraryEntryState {
  entry: LibraryEntryDetail | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
  refresh: () => Promise<void>;
}

export interface UseLibraryEntryOptions {
  client?: StrategyLibraryClient;
}

export function useLibraryEntry(
  entryId: string,
  { client = strategyLibraryClient }: UseLibraryEntryOptions = {},
): LibraryEntryState {
  const clientRef = useRef(client);
  const [entry, setEntry] = useState<LibraryEntryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    setNotFound(false);
    try {
      const result = await clientRef.current.get(entryId);
      if (current !== sequence.current) return;
      setEntry(result);
      setError(null);
    } catch (reason: unknown) {
      if (current !== sequence.current) return;
      if (reason instanceof Error && /not found/i.test(reason.message)) {
        setNotFound(true);
      }
      setError(
        reason instanceof Error ? reason.message : 'Unable to load strategy',
      );
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [entryId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  return { entry, loading, error, notFound, refresh: load };
}
