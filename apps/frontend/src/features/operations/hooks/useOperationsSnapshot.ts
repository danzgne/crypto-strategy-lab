'use client';

import { useCallback, useEffect, useState } from 'react';
import type { OperationsSnapshot } from '@crypto-strategy-lab/shared';

import { ApiError } from '../../../shared/api/apiError';
import { fetchOperationsSnapshot } from '../api/operationsClient';

export const REFRESH_INTERVAL_MS = 5_000;
const STALE_TIMEOUT_MS = 10_000;

export interface UseOperationsSnapshotResult {
  snapshot: OperationsSnapshot | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isStale: boolean;
  isForbidden: boolean;
  isEmpty: boolean;
  error: string | null;
  lastFetchedAt: Date | null;
  refetch: () => Promise<void>;
}

export function useOperationsSnapshot(
  refreshIntervalMs = REFRESH_INTERVAL_MS,
): UseOperationsSnapshotResult {
  const [snapshot, setSnapshot] = useState<OperationsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isForbidden, setIsForbidden] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setReloadKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let active = true;

    const execute = async (isBackground: boolean): Promise<void> => {
      if (isBackground) {
        setIsRefreshing(true);
      }

      try {
        const data = await fetchOperationsSnapshot();
        if (!active) return;

        setSnapshot(data);
        setError(null);
        setIsForbidden(false);
        setIsStale(false);
        setLastFetchedAt(new Date());
      } catch (err) {
        if (!active) return;

        if (err instanceof ApiError && err.status === 403) {
          setIsForbidden(true);
          setError('Forbidden: Administrator privileges required.');
        } else if (err instanceof ApiError && err.status === 401) {
          setIsForbidden(true);
          setError('Unauthorized: Please log in as an administrator.');
        } else {
          const message =
            err instanceof Error
              ? err.message
              : 'Failed to fetch operations snapshot';
          setError(message);
          setIsStale(true);
        }
      } finally {
        if (active) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    };

    void execute(false);

    const refreshTimer = setInterval(() => {
      void execute(true);
    }, refreshIntervalMs);

    const handleVisibilityOrFocus = (): void => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible'
      ) {
        void execute(true);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('visibilitychange', handleVisibilityOrFocus);
      window.addEventListener('focus', handleVisibilityOrFocus);
    }

    return () => {
      active = false;
      clearInterval(refreshTimer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('visibilitychange', handleVisibilityOrFocus);
        window.removeEventListener('focus', handleVisibilityOrFocus);
      }
    };
  }, [refreshIntervalMs, reloadKey]);

  useEffect(() => {
    const staleTimer = setInterval(() => {
      if (
        lastFetchedAt &&
        Date.now() - lastFetchedAt.getTime() > STALE_TIMEOUT_MS
      ) {
        setIsStale(true);
      }
    }, 1_000);

    return () => clearInterval(staleTimer);
  }, [lastFetchedAt]);

  const isEmpty = Boolean(
    snapshot &&
    snapshot.jobs.countByStatus.PENDING === 0 &&
    snapshot.jobs.countByStatus.CLAIMED === 0 &&
    snapshot.jobs.countByStatus.COMPLETED === 0 &&
    snapshot.jobs.countByStatus.FAILED === 0 &&
    snapshot.workers.instances.length === 0 &&
    snapshot.outbox.eligibleBacklog === 0 &&
    snapshot.outbox.deadLetterCount === 0 &&
    snapshot.recentFailures.length === 0,
  );

  return {
    error,
    isEmpty,
    isForbidden,
    isLoading,
    isRefreshing,
    isStale,
    lastFetchedAt,
    refetch,
    snapshot,
  };
}
