'use client';

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@crypto-strategy-lab/shared';
import { io, type Socket } from 'socket.io-client';

import { getPublicBackendUrl } from '../api/publicBackendUrl';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let realtimeSocket: AppSocket | undefined;

export function getRealtimeSocket(): AppSocket {
  realtimeSocket ??= io(getPublicBackendUrl(), {
    autoConnect: false,
    reconnection: true,
    transports: ['websocket', 'polling'],
    tryAllTransports: true,
    withCredentials: true,
  });

  return realtimeSocket;
}
