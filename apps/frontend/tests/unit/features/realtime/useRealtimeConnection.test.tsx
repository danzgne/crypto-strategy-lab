import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  type RealtimeSocket,
  useRealtimeConnection,
} from '../../../../src/features/realtime/hooks/useRealtimeConnection';

describe('useRealtimeConnection', () => {
  it('becomes live only after a real transport ping and returns offline on disconnect', async () => {
    const listeners = new Map<string, (...arguments_: unknown[]) => void>();
    const emitWithAck = vi.fn().mockResolvedValue({
      requestId: 'request-27',
      clientSentAt: '2026-08-21T10:00:00.000Z',
      serverReceivedAt: '2026-08-21T10:00:00.010Z',
    });
    const socket = {
      connected: false,
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

    act(() => listeners.get('connect')?.());

    await waitFor(() => expect(result.current.phase).toBe('live'));
    expect(socket.connect).toHaveBeenCalledOnce();
    expect(emitWithAck).toHaveBeenCalledWith(
      'market-data:ping',
      expect.objectContaining({ requestId: expect.any(String) }),
    );
    expect(result.current.latencyMs).not.toBeNull();

    act(() => listeners.get('disconnect')?.('transport close'));
    expect(result.current.phase).toBe('offline');
  });
});
