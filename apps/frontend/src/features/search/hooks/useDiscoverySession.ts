'use client';

import type {
  DiscoveryProgressPayload,
  DiscoverySessionState,
  SearchRunSummary,
  StartDiscoverySessionInput,
} from '@crypto-strategy-lab/shared';
import { useCallback, useEffect, useState } from 'react';
import { getRealtimeSocket } from '../../../shared/realtime/socketClient';
import { searchClient } from '../api/searchClient';

export interface UseDiscoverySessionResult {
  session: DiscoverySessionState | null;
  progress: DiscoveryProgressPayload | null;
  history: SearchRunSummary[];
  loading: boolean;
  error: string | null;
  startSession: (input: StartDiscoverySessionInput) => Promise<void>;
  pauseSession: () => Promise<void>;
  resumeSession: () => Promise<void>;
  stopSession: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  pinExperiment: (experimentId: string, isPinned: boolean) => Promise<void>;
}

export function useDiscoverySession(): UseDiscoverySessionResult {
  const [session, setSession] = useState<DiscoverySessionState | null>(null);
  const [progress, setProgress] = useState<DiscoveryProgressPayload | null>(
    null,
  );
  const [history, setHistory] = useState<SearchRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshHistory = useCallback(async () => {
    try {
      const res = await searchClient.getHistoricalRuns();
      setHistory(res.runs);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function initSession() {
      try {
        const res = await searchClient.getCurrentSession();
        if (!active) return;
        setSession(res.session);
        const histRes = await searchClient.getHistoricalRuns();
        if (!active) return;
        setHistory(histRes.runs);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError((err as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }

    void initSession();

    const socket = getRealtimeSocket();
    if (!socket.connected) {
      socket.connect();
    }

    const handleProgress = (update: DiscoveryProgressPayload) => {
      setProgress(update);
      setSession((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          bestCandidate: update.bestCandidate ?? prev.bestCandidate,
          bestScore: update.bestScore,
          currentRunId: update.currentRunId,
          lastRunStopReason: update.stopReason,
          latestCandidate: update.latestCandidate ?? prev.latestCandidate,
          status: update.sessionStatus,
          totalAcceptedCandidates: update.acceptedCandidates,
          totalRunsCompleted: update.totalRunsCompleted,
        };
      });
      void refreshHistory();
    };

    socket.on('discovery:progress', handleProgress);

    return () => {
      active = false;
      socket.off('discovery:progress', handleProgress);
    };
  }, [refreshHistory]);

  const startSession = useCallback(
    async (input: StartDiscoverySessionInput) => {
      setError(null);
      try {
        const res = await searchClient.startSession(input);
        setSession(res.session);
        setProgress(null);
        await refreshHistory();
      } catch (err) {
        setError((err as Error).message);
        throw err;
      }
    },
    [refreshHistory],
  );

  const pauseSession = useCallback(async () => {
    setError(null);
    try {
      await searchClient.pauseSession();
      setSession((prev) => (prev ? { ...prev, status: 'PAUSED' } : null));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const resumeSession = useCallback(async () => {
    setError(null);
    try {
      await searchClient.resumeSession();
      setSession((prev) => (prev ? { ...prev, status: 'ACTIVE' } : null));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const stopSession = useCallback(async () => {
    setError(null);
    try {
      await searchClient.stopSession();
      setSession(null);
      setProgress(null);
      await refreshHistory();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [refreshHistory]);

  const pinExperiment = useCallback(
    async (experimentId: string, isPinned: boolean) => {
      try {
        await searchClient.setExperimentPinned(experimentId, isPinned);
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [],
  );

  return {
    error,
    history,
    loading,
    pauseSession,
    pinExperiment,
    progress,
    refreshHistory,
    resumeSession,
    session,
    startSession,
    stopSession,
  };
}
