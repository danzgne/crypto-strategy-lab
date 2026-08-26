import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  type MarketSubscriptionSocket,
  useMarketSubscription,
} from '../../../../src/features/market-data/hooks/useMarketSubscription';

describe('useMarketSubscription', () => {
  it('hydrates a chart from its private snapshot and replaces the forming candle', async () => {
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
    } as unknown as MarketSubscriptionSocket;
    const { result } = renderHook(() =>
      useMarketSubscription({
        socketFactory: () => socket,
        chartId: 'chart-28',
        pair: 'BTCUSDT',
        timeframe: '1m',
        limit: 10,
      }),
    );

    expect(socket.connect).toHaveBeenCalledOnce();
    act(() => listeners.get('connect')?.());
    expect(socket.emit).toHaveBeenCalledWith('market:subscribe', {
      chartId: 'chart-28',
      pair: 'BTCUSDT',
      timeframe: '1m',
      limit: 10,
    });

    const firstCandle = {
      pair: 'BTCUSDT' as const,
      timeframe: '1m' as const,
      openTime: 1_756_000_000_000,
      closeTime: 1_756_000_059_999,
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 10,
      isClosed: false,
    };
    act(() =>
      listeners.get('market:snapshot')?.({
        chartId: 'chart-28',
        pair: 'BTCUSDT',
        timeframe: '1m',
        candles: [firstCandle],
      }),
    );
    await waitFor(() => expect(result.current.candles).toEqual([firstCandle]));
    act(() =>
      listeners.get('market:status')?.({
        pair: 'BTCUSDT',
        timeframe: '1m',
        status: 'LIVE',
      }),
    );

    const liveUpdate = { ...firstCandle, close: 101.5, high: 102 };
    act(() =>
      listeners.get('market:candle')?.({
        pair: 'BTCUSDT',
        timeframe: '1m',
        candle: liveUpdate,
      }),
    );

    expect(result.current.candles).toEqual([liveUpdate]);
    expect(result.current.phase).toBe('live');
  });

  it('resubscribes on a client reconnect and replaces the chart with a fresh snapshot', async () => {
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
    } as unknown as MarketSubscriptionSocket;
    const { result } = renderHook(() =>
      useMarketSubscription({
        socketFactory: () => socket,
        chartId: 'chart-reconnect',
        pair: 'BTCUSDT',
        timeframe: '5m',
        limit: 10,
      }),
    );

    act(() => listeners.get('connect')?.());
    const firstCandle = {
      pair: 'BTCUSDT' as const,
      timeframe: '5m' as const,
      openTime: 1_756_000_000_000,
      closeTime: 1_756_000_299_999,
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 10,
      isClosed: true,
    };
    act(() =>
      listeners.get('market:snapshot')?.({
        chartId: 'chart-reconnect',
        pair: 'BTCUSDT',
        timeframe: '5m',
        candles: [firstCandle],
      }),
    );
    await waitFor(() => expect(result.current.candles).toEqual([firstCandle]));

    act(() => listeners.get('disconnect')?.());
    expect(result.current.phase).toBe('reconnecting');

    act(() => listeners.get('connect')?.());
    expect(socket.emit).toHaveBeenNthCalledWith(2, 'market:subscribe', {
      chartId: 'chart-reconnect',
      pair: 'BTCUSDT',
      timeframe: '5m',
      limit: 10,
    });

    const freshCandle = {
      ...firstCandle,
      openTime: firstCandle.openTime + 300_000,
    };
    act(() =>
      listeners.get('market:snapshot')?.({
        chartId: 'chart-reconnect',
        pair: 'BTCUSDT',
        timeframe: '5m',
        candles: [freshCandle],
      }),
    );
    await waitFor(() => expect(result.current.candles).toEqual([freshCandle]));
  });

  it('requests and merges older candles when the chart reaches its history boundary', async () => {
    const listeners = new Map<string, (...arguments_: unknown[]) => void>();
    const emit = vi.fn((...arguments_: unknown[]) => {
      void arguments_;
      return undefined;
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
      emit,
    } as unknown as MarketSubscriptionSocket;
    const { result } = renderHook(() =>
      useMarketSubscription({
        socketFactory: () => socket,
        chartId: 'chart-history',
        pair: 'BTCUSDT',
        timeframe: '1m',
        limit: 10,
      }),
    );

    (socket as unknown as { connected: boolean }).connected = true;
    act(() => listeners.get('connect')?.());
    const latestCandle = {
      pair: 'BTCUSDT' as const,
      timeframe: '1m' as const,
      openTime: 1_756_000_060_000,
      closeTime: 1_756_000_119_999,
      open: 101,
      high: 102,
      low: 100,
      close: 101.5,
      volume: 11,
      isClosed: true,
    };
    act(() =>
      listeners.get('market:snapshot')?.({
        chartId: 'chart-history',
        pair: 'BTCUSDT',
        timeframe: '1m',
        candles: [latestCandle],
      }),
    );
    await waitFor(() => expect(result.current.candles).toEqual([latestCandle]));

    act(() => {
      result.current.requestOlderHistory();
      result.current.requestOlderHistory();
    });
    expect(emit).toHaveBeenLastCalledWith('market:history:request', {
      chartId: 'chart-history',
      pair: 'BTCUSDT',
      timeframe: '1m',
      beforeOpenTime: latestCandle.openTime,
      limit: 250,
    });
    expect(
      emit.mock.calls.filter(([event]) => event === 'market:history:request'),
    ).toHaveLength(1);

    const olderCandle = {
      ...latestCandle,
      openTime: latestCandle.openTime - 60_000,
      closeTime: latestCandle.openTime - 1,
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 10,
    };
    act(() =>
      listeners.get('market:history')?.({
        chartId: 'chart-history',
        pair: 'BTCUSDT',
        timeframe: '1m',
        candles: [olderCandle],
        hasMore: true,
      }),
    );

    await waitFor(() =>
      expect(result.current.candles).toEqual([olderCandle, latestCandle]),
    );
    expect(result.current.historyLoading).toBe(false);
    expect(result.current.hasMoreHistory).toBe(true);
  });
});
