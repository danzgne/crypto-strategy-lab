'use client';

import type {
  LeaderboardEntrySnapshot,
  LeaderboardSnapshot,
} from '@crypto-strategy-lab/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getRealtimeSocket,
  type AppSocket,
} from '../../../shared/realtime/socketClient';
import {
  leaderboardClient,
  type LeaderboardClient,
} from '../api/leaderboardClient';

export interface LeaderboardState {
  entries: LeaderboardEntrySnapshot[];
  k: number;
  updatedAt: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export interface UseLeaderboardOptions {
  client?: LeaderboardClient;
  socketFactory?: () => AppSocket;
}

export function useLeaderboard({
  client = leaderboardClient,
  socketFactory = getRealtimeSocket,
}: UseLeaderboardOptions = {}): LeaderboardState {
  const clientRef = useRef(client);
  const socketFactoryRef = useRef(socketFactory);
  const mountedRef = useRef(true);
  const requestInFlightRef = useRef(false);
  const loadedRef = useRef(false);
  const [state, setState] = useState<Omit<LeaderboardState, 'refresh'>>({
    entries: [],
    error: null,
    k: 10,
    loading: true,
    updatedAt: null,
  });

  const refresh = useCallback(async (): Promise<void> => {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    const showLoading = !loadedRef.current;
    if (showLoading) setState((current) => ({ ...current, loading: true }));
    try {
      const next = await clientRef.current.get();
      if (!mountedRef.current) return;
      setState({
        entries: next.entries,
        error: null,
        k: next.k,
        loading: false,
        updatedAt: next.updatedAt,
      });
      loadedRef.current = true;
    } catch (reason: unknown) {
      if (!mountedRef.current) return;
      setState((current) => ({
        ...current,
        error:
          reason instanceof Error
            ? reason.message
            : 'Unable to load leaderboard',
        loading: false,
      }));
    } finally {
      requestInFlightRef.current = false;
      if (mountedRef.current && showLoading) {
        setState((current) => ({ ...current, loading: false }));
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    const socket = socketFactoryRef.current();
    const handleUpdate = (snapshot: LeaderboardSnapshot): void => {
      if (!mountedRef.current) return;
      setState({
        entries: snapshot.entries,
        error: null,
        k: snapshot.k,
        loading: false,
        updatedAt: snapshot.updatedAt,
      });
      loadedRef.current = true;
    };
    const handleConnect = (): void => {
      void refresh();
    };

    socket.on('leaderboard:updated', handleUpdate);
    socket.on('connect', handleConnect);
    if (!socket.connected) socket.connect();

    return () => {
      socket.off('leaderboard:updated', handleUpdate);
      socket.off('connect', handleConnect);
    };
  }, [refresh]);

  return { ...state, refresh };
}
