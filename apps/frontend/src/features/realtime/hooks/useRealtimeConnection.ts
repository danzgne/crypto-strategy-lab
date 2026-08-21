'use client';

import type { MarketDataTransportStatus } from '@crypto-strategy-lab/shared';
import { useEffect, useRef, useState } from 'react';

import {
  getRealtimeSocket,
  type AppSocket,
} from '../../../shared/realtime/socketClient';

export type RealtimeSocket = AppSocket;

export interface RealtimeConnectionState {
  phase: 'connecting' | 'live' | 'offline';
  latencyMs: number | null;
  serverTime: string | null;
  detail: string;
}

const INITIAL_STATE: RealtimeConnectionState = {
  phase: 'connecting',
  latencyMs: null,
  serverTime: null,
  detail: 'Opening a secure realtime channel',
};

export function useRealtimeConnection(
  socketFactory: () => RealtimeSocket = getRealtimeSocket,
): RealtimeConnectionState {
  const [connection, setConnection] =
    useState<RealtimeConnectionState>(INITIAL_STATE);
  const socketFactoryRef = useRef(socketFactory);

  useEffect(() => {
    const socket = socketFactoryRef.current();
    let active = true;

    const verifyRoundTrip = async (): Promise<void> => {
      const startedAt = performance.now();
      setConnection((current) => ({
        ...current,
        phase: 'connecting',
        detail: 'Verifying backend round trip',
      }));

      try {
        const pong = await socket
          .timeout(3_000)
          .emitWithAck('market-data:ping', {
            requestId: globalThis.crypto.randomUUID(),
            clientSentAt: new Date().toISOString(),
          });

        if (!active) return;
        setConnection((current) => ({
          phase: 'live',
          latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
          serverTime: current.serverTime ?? pong.serverReceivedAt,
          detail: 'Round trip verified',
        }));
      } catch {
        if (!active) return;
        setConnection({
          phase: 'offline',
          latencyMs: null,
          serverTime: null,
          detail: 'Backend did not acknowledge the transport ping',
        });
      }
    };

    const handleConnect = (): void => {
      void verifyRoundTrip();
    };
    const handleDisconnect = (): void => {
      setConnection({
        phase: 'offline',
        latencyMs: null,
        serverTime: null,
        detail: 'Realtime transport disconnected',
      });
    };
    const handleConnectError = (): void => {
      setConnection({
        phase: 'offline',
        latencyMs: null,
        serverTime: null,
        detail: 'Backend is unavailable; reconnecting automatically',
      });
    };
    const handleStatus = (status: MarketDataTransportStatus): void => {
      setConnection((current) => ({
        ...current,
        serverTime: status.serverTime,
      }));
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('market-data:status', handleStatus);

    if (socket.connected) {
      void verifyRoundTrip();
    } else {
      socket.connect();
    }

    return () => {
      active = false;
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('market-data:status', handleStatus);
      socket.disconnect();
    };
  }, []);

  return connection;
}
