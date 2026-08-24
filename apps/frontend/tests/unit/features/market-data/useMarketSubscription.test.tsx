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
});
