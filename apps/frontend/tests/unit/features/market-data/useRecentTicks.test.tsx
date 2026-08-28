import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  type RecentTicksSocket,
  useRecentTicks,
} from '../../../../src/features/market-data/hooks/useRecentTicks';

describe('useRecentTicks', () => {
  it('subscribes through the shared socket and merges live ticks newest first', async () => {
    const listeners = new Map<string, (...arguments_: unknown[]) => void>();
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
      emit: vi.fn(() => socket),
    } as unknown as RecentTicksSocket;
    const { result } = renderHook(() =>
      useRecentTicks({
        socketFactory: () => socket,
        pair: 'BTCUSDT',
        limit: 2,
      }),
    );

    expect(socket.connect).toHaveBeenCalledOnce();
    act(() => listeners.get('connect')?.());
    expect(socket.emit).toHaveBeenCalledWith('market:ticks:subscribe', {
      pair: 'BTCUSDT',
      limit: 2,
    });

    const firstTick = {
      pair: 'BTCUSDT' as const,
      tradeId: '1',
      time: 1_756_000_300_100,
      price: 81_049.99,
      quantity: 0.012,
      side: 'SELL' as const,
    };
    const secondTick = {
      ...firstTick,
      tradeId: '2',
      time: firstTick.time + 100,
      price: 81_050.01,
      side: 'BUY' as const,
    };
    act(() =>
      listeners.get('market:ticks:snapshot')?.({
        pair: 'BTCUSDT',
        ticks: [firstTick],
      }),
    );
    await waitFor(() => expect(result.current.ticks).toEqual([firstTick]));

    act(() =>
      listeners.get('market:tick')?.({
        pair: 'BTCUSDT',
        tick: secondTick,
      }),
    );

    expect(result.current.ticks).toEqual([secondTick, firstTick]);
    expect(result.current.loading).toBe(false);
    expect(result.current.detail).toBe('Recent trade events updating live');
  });
});
