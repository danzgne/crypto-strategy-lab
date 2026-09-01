'use client';

import type {
  SaveStrategyRequest,
  SavedStrategy,
} from '@crypto-strategy-lab/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  strategyLibraryClient,
  type StrategyLibraryClient,
} from '../api/strategyLibraryClient';

export interface SavedStrategiesState {
  strategies: SavedStrategy[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  save: (request: SaveStrategyRequest) => Promise<SavedStrategy | null>;
}

export interface UseSavedStrategiesOptions {
  client?: StrategyLibraryClient;
}

export function useSavedStrategies({
  client = strategyLibraryClient,
}: UseSavedStrategiesOptions = {}): SavedStrategiesState {
  const clientRef = useRef(client);
  const [strategies, setStrategies] = useState<SavedStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void clientRef.current
      .list()
      .then((nextStrategies) => {
        if (!active) return;
        setStrategies(nextStrategies);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof Error
            ? reason.message
            : 'Unable to load saved strategies',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const save = useCallback(async (request: SaveStrategyRequest) => {
    setSaving(true);
    setError(null);
    try {
      const saved = await clientRef.current.save(request);
      setStrategies((current) => [
        saved,
        ...current.filter((strategy) => strategy.id !== saved.id),
      ]);
      return saved;
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to save strategy',
      );
      return null;
    } finally {
      setSaving(false);
    }
  }, []);

  return { error, loading, save, saving, strategies };
}
