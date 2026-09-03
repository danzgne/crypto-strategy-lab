import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  REALTIME_HEARTBEAT_INTERVAL_MS,
  type RealtimeSocket,
  useRealtimeConnection,
} from '../../../../src/features/market-data/hooks/useRealtimeConnection';

describe('useRealtimeConnection', () => {
  it('refreshes latency and server time with a live heartbeat', async () => {
    vi.useFakeTimers();
    try {
      const listeners = new Map<string, (...arguments_: unknown[]) => void>();
      const emitWithAck = vi
        .fn()
        .mockResolvedValueOnce({
          requestId: 'request-27',
          clientSentAt: '2026-08-21T10:00:00.000Z',
          serverReceivedAt: '2026-08-21T10:00:00.010Z',
          source: 'Configured market adapter',
        })
        .mockResolvedValueOnce({
          requestId: 'request-28',
          clientSentAt: '2026-08-21T10:00:05.000Z',
          serverReceivedAt: '2026-08-21T10:00:05.010Z',
          source: 'Configured market adapter',
        });
      let connected = false;
      const socket = {
        get connected() {
          return connected;
        },
        on: vi.fn(
          (event: string, listener: (...arguments_: unknown[]) => void) => {
            listeners.set(event, listener);
            return socket;
          },
        ),
        off: vi.fn((event: string) => {
          listeners.delete(event);
          return socket;
        }),
        connect: vi.fn(() => socket),
        disconnect: vi.fn(() => socket),
        timeout: vi.fn(() => ({ emitWithAck })),
      } as unknown as RealtimeSocket;
      const { result } = renderHook(() => useRealtimeConnection(() => socket));

      expect(result.current.phase).toBe('connecting');
      expect(socket.connect).toHaveBeenCalledOnce();

      act(() => {
        connected = true;
        listeners.get('connect')?.();
      });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(result.current.phase).toBe('live');
      expect(socket.connect).toHaveBeenCalledOnce();
      expect(emitWithAck).toHaveBeenCalledWith(
        'market-data:ping',
        expect.objectContaining({ requestId: expect.any(String) }),
      );
      expect(result.current.serverTime).toBe('2026-08-21T10:00:00.010Z');
      expect(result.current.dataSource).toBe('Configured market adapter');
      expect(result.current.latencyMs).not.toBeNull();

      act(() =>
        listeners.get('market:tick')?.({
          pair: 'BTCUSDT',
          tick: {
            pair: 'BTCUSDT',
            tradeId: 'trade-1',
            time: 1_756_000_300_100,
            price: 81_049.99,
            quantity: 0.012,
            side: 'BUY',
          },
        }),
      );
      expect(Date.parse(result.current.lastDataAt ?? '')).not.toBeNaN();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(REALTIME_HEARTBEAT_INTERVAL_MS);
      });

      expect(result.current.serverTime).toBe('2026-08-21T10:00:05.010Z');
      expect(emitWithAck).toHaveBeenCalledTimes(2);

      act(() => {
        connected = false;
        listeners.get('disconnect')?.('transport close');
      });
      expect(result.current.phase).toBe('reconnecting');
      expect(result.current.detail).toContain('reconnecting');
    } finally {
      vi.useRealTimers();
    }
  });
});
