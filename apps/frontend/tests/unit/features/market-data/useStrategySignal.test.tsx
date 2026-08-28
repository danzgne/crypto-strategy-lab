import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  type StrategySignalSocket,
  useStrategySignal,
} from '../../../../src/features/market-data/hooks/useStrategySignal';

describe('useStrategySignal', () => {
  it('subscribes only while enabled and retains closed-candle updates', async () => {
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
    } as unknown as StrategySignalSocket;
    const { result, unmount } = renderHook(() =>
      useStrategySignal({
        chartId: 'chart-ma',
        enabled: true,
        pair: 'BTCUSDT',
        socketFactory: () => socket,
        strategyId: 'ma',
        timeframe: '1m',
      }),
    );

    act(() => {
      (socket as unknown as { connected: boolean }).connected = true;
      listeners.get('connect')?.();
    });
    expect(socket.emit).toHaveBeenCalledWith('strategy:subscribe', {
      chartId: 'chart-ma',
      pair: 'BTCUSDT',
      strategyId: 'ma',
      timeframe: '1m',
      limit: 500,
    });

    const candle = {
      pair: 'BTCUSDT' as const,
      timeframe: '1m' as const,
      openTime: 1_756_000_000_000,
      closeTime: 1_756_000_059_999,
      open: 100,
      high: 102,
      low: 99,
      close: 101,
      volume: 10,
      isClosed: true,
    };
    const update = {
      pair: 'BTCUSDT' as const,
      timeframe: '1m' as const,
      candle,
      indicators: { MA_20: 100.5, MA_50: 100.25 },
      signal: {
        action: 'BUY' as const,
        indicators: { MA_20: 100.5, MA_50: 100.25 },
      },
    };
    const historicalUpdate = {
      ...update,
      candle: {
        ...candle,
        openTime: candle.openTime - 60_000,
        closeTime: candle.closeTime - 60_000,
      },
      signal: {
        action: 'HOLD' as const,
        indicators: { MA_20: 99.5, MA_50: 99.25 },
      },
    };
    act(() =>
      listeners.get('strategy:snapshot')?.({
        chartId: 'chart-ma',
        strategyId: 'ma',
        pair: 'BTCUSDT',
        timeframe: '1m',
        signals: [historicalUpdate],
      }),
    );
    await waitFor(() =>
      expect(result.current.history).toEqual([historicalUpdate]),
    );
    act(() => listeners.get('strategy:signal')?.(update));

    await waitFor(() => expect(result.current.latest).toEqual(update));
    expect(result.current.history).toEqual([historicalUpdate, update]);

    unmount();
    expect(socket.emit).toHaveBeenCalledWith('strategy:unsubscribe', {
      chartId: 'chart-ma',
      pair: 'BTCUSDT',
      strategyId: 'ma',
      timeframe: '1m',
    });
  });
});
