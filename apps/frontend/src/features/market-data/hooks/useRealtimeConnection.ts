'use client';

import type { MarketDataTransportStatus } from '@crypto-strategy-lab/shared';
import { useEffect, useRef, useState } from 'react';

import {
  getRealtimeSocket,
  type AppSocket,
} from '../../../shared/realtime/socketClient';

export type RealtimeSocket = AppSocket;

export const REALTIME_HEARTBEAT_INTERVAL_MS = 5_000;

const DEFAULT_DATA_SOURCE = 'Market Data Service';

export interface RealtimeConnectionState {
  phase: 'connecting' | 'live' | 'reconnecting' | 'stale';
  dataSource: string;
  latencyMs: number | null;
  lastDataAt: string | null;
  serverTime: string | null;
  detail: string;
}

const INITIAL_STATE: RealtimeConnectionState = {
  phase: 'connecting',
  dataSource: DEFAULT_DATA_SOURCE,
  latencyMs: null,
  lastDataAt: null,
  serverTime: null,
  detail: 'Opening a secure realtime channel',
};

function unavailableConnection(
  current: RealtimeConnectionState,
  phase: 'reconnecting' | 'stale',
  detail: string,
): RealtimeConnectionState {
  return {
    ...current,
    phase,
    latencyMs: null,
    detail,
  };
}

export function useRealtimeConnection(
  socketFactory: () => RealtimeSocket = getRealtimeSocket,
): RealtimeConnectionState {
  const [connection, setConnection] =
    useState<RealtimeConnectionState>(INITIAL_STATE);
  const socketFactoryRef = useRef(socketFactory);

  useEffect(() => {
    const socket = socketFactoryRef.current();
    let active = true;
    let heartbeatInFlight = false;
    let connectionEpoch = 0;

    const verifyRoundTrip = async (): Promise<void> => {
      if (!active || !socket.connected || heartbeatInFlight) return;
      heartbeatInFlight = true;
      const heartbeatEpoch = connectionEpoch;
      const startedAt = performance.now();
      setConnection((current) => ({
        ...current,
        phase: current.phase === 'live' ? 'live' : 'connecting',
        detail:
          current.phase === 'live'
            ? 'Refreshing transport metrics'
            : 'Verifying backend round trip',
      }));

      try {
        const pong = await socket
          .timeout(3_000)
          .emitWithAck('market-data:ping', {
            requestId: globalThis.crypto.randomUUID(),
            clientSentAt: new Date().toISOString(),
          });

        if (
          !active ||
          !socket.connected ||
          heartbeatEpoch !== connectionEpoch
        ) {
          return;
        }
        setConnection((current) => ({
          ...current,
          dataSource: pong.source ?? current.dataSource,
          phase: 'live',
          latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
          serverTime: pong.serverReceivedAt,
          detail: 'Transport heartbeat verified',
        }));
      } catch {
        if (
          !active ||
          !socket.connected ||
          heartbeatEpoch !== connectionEpoch
        ) {
          return;
        }
        setConnection((current) =>
          unavailableConnection(
            current,
            'stale',
            'Backend did not acknowledge the transport ping',
          ),
        );
      } finally {
        heartbeatInFlight = false;
        if (active && socket.connected && heartbeatEpoch !== connectionEpoch) {
          void verifyRoundTrip();
        }
      }
    };

    const handleConnect = (): void => {
      connectionEpoch += 1;
      void verifyRoundTrip();
    };
    const handleDisconnect = (): void => {
      connectionEpoch += 1;
      setConnection((current) =>
        unavailableConnection(
          current,
          'reconnecting',
          'Realtime transport disconnected; reconnecting',
        ),
      );
    };
    const handleConnectError = (): void => {
      connectionEpoch += 1;
      setConnection((current) =>
        unavailableConnection(
          current,
          'reconnecting',
          'Backend is unavailable; reconnecting automatically',
        ),
      );
    };
    const handleStatus = (status: MarketDataTransportStatus): void => {
      setConnection((current) => ({
        ...current,
        dataSource: status.source ?? current.dataSource,
        serverTime: status.serverTime,
      }));
    };
    const markDataReceived = (): void => {
      if (!active) return;
      setConnection((current) => ({
        ...current,
        lastDataAt: new Date().toISOString(),
      }));
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('market-data:status', handleStatus);
    socket.on('market:candle', markDataReceived);
    socket.on('market:tick', markDataReceived);

    const heartbeatTimer = setInterval(() => {
      void verifyRoundTrip();
    }, REALTIME_HEARTBEAT_INTERVAL_MS);

    if (socket.connected) {
      void verifyRoundTrip();
    } else {
      socket.connect();
    }

    return () => {
      active = false;
      connectionEpoch += 1;
      clearInterval(heartbeatTimer);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('market-data:status', handleStatus);
      socket.off('market:candle', markDataReceived);
      socket.off('market:tick', markDataReceived);
      socket.disconnect();
    };
  }, []);

  return connection;
}
