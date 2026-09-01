'use client';

import type { BacktestResultResponse } from '@crypto-strategy-lab/shared';
import { useEffect, useRef, useState } from 'react';

import { backtestClient, type BacktestClient } from '../api/backtestClient';

export interface UseBacktestOptions {
  client?: BacktestClient;
  pollIntervalMs?: number;
}

export interface BacktestState {
  result: BacktestResultResponse | null;
  loading: boolean;
  error: string | null;
}

interface PollingState extends BacktestState {
  experimentId: string;
}

const TERMINAL_STATUSES = new Set(['completed', 'failed']);

export function useBacktest(
  experimentId: string,
  { client = backtestClient, pollIntervalMs = 1_000 }: UseBacktestOptions = {},
): BacktestState {
  const clientRef = useRef(client);
  const [state, setState] = useState<PollingState>(() => ({
    error: null,
    experimentId,
    loading: true,
    result: null,
  }));

  useEffect(() => {
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const poll = async (): Promise<void> => {
      try {
        const next = await clientRef.current.get(experimentId);
        if (!active) return;
        setState({
          error: null,
          experimentId,
          loading: false,
          result: next,
        });
        if (!TERMINAL_STATUSES.has(next.status)) {
          timeout = setTimeout(() => void poll(), pollIntervalMs);
        }
      } catch (reason: unknown) {
        if (!active) return;
        setState({
          error:
            reason instanceof Error
              ? reason.message
              : 'Unable to load backtest',
          experimentId,
          loading: false,
          result: null,
        });
      }
    };

    void poll();

    return () => {
      active = false;
      if (timeout !== undefined) clearTimeout(timeout);
    };
  }, [experimentId, pollIntervalMs]);

  if (state.experimentId !== experimentId) {
    return { error: null, loading: true, result: null };
  }
  return state;
}
