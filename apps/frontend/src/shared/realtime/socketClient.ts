'use client';

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@crypto-strategy-lab/shared';
import { io, type Socket } from 'socket.io-client';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let realtimeSocket: AppSocket | undefined;

export function getRealtimeSocket(): AppSocket {
  realtimeSocket ??= io(
    process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3100',
    {
      autoConnect: false,
      reconnection: true,
      transports: ['websocket'],
      withCredentials: true,
    },
  );

  return realtimeSocket;
}
