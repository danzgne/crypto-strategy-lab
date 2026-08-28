import type { Tick } from '@crypto-strategy-lab/shared';
import { describe, expect, it, vi } from 'vitest';

import type { ExchangeAdapter } from '../../../../src/api/features/marketData/application/interfaces/exchangeAdapter.interface';
import { MarketTickService } from '../../../../src/api/features/marketData/application/services/marketTickService';

const ticks: Tick[] = [
  {
    pair: 'BTCUSDT',
    tradeId: '1',
    time: 1_756_000_300_100,
    price: 81049.99,
    quantity: 0.012,
    side: 'SELL',
  },
  {
    pair: 'BTCUSDT',
    tradeId: '2',
    time: 1_756_000_300_200,
    price: 81050.01,
    quantity: 0.005,
    side: 'BUY',
  },
  {
    pair: 'BTCUSDT',
    tradeId: '3',
    time: 1_756_000_300_300,
    price: 81050.02,
    quantity: 0.01,
    side: 'BUY',
  },
];

describe('MarketTickService', () => {
  it('shares one bounded stream and returns the newest ticks first', async () => {
    let streamHandlers:
      | Parameters<NonNullable<ExchangeAdapter['openTradeStream']>>[1]
      | undefined;
    const closeStream = vi.fn();
    const exchangeAdapter: ExchangeAdapter = {
      fetchCandles: vi.fn(),
      openKlineStream: vi.fn(() => () => undefined),
      openTradeStream: vi.fn((_pairs, handlers) => {
        streamHandlers = handlers;
        return closeStream;
      }),
    };
    const onTick = vi.fn();
    const service = new MarketTickService({ exchangeAdapter });

    const firstSubscription = await service.subscribe(
      { pair: 'btcusdt', limit: 3 },
      { onTick },
    );
    streamHandlers?.onTick(ticks[0]!);
    streamHandlers?.onTick(ticks[1]!);
    streamHandlers?.onTick(ticks[2]!);

    const secondSubscription = await service.subscribe({
      pair: 'BTCUSDT',
      limit: 2,
    });

    expect(exchangeAdapter.openTradeStream).toHaveBeenCalledOnce();
    expect(exchangeAdapter.openTradeStream).toHaveBeenCalledWith(
      ['BTCUSDT'],
      expect.any(Object),
    );
    expect(secondSubscription.ticks).toEqual([ticks[2], ticks[1]]);
    expect(onTick).toHaveBeenCalledTimes(3);

    await firstSubscription.unsubscribe();
    expect(closeStream).not.toHaveBeenCalled();
    await secondSubscription.unsubscribe();
    expect(closeStream).toHaveBeenCalledOnce();
  });

  it('reconnects a dropped trade stream with bounded backoff', async () => {
    vi.useFakeTimers();
    try {
      const streamHandlers: Array<
        Parameters<NonNullable<ExchangeAdapter['openTradeStream']>>[1]
      > = [];
      const closeStreams = [vi.fn(), vi.fn()];
      let streamIndex = 0;
      const onStatus = vi.fn();
      const exchangeAdapter: ExchangeAdapter = {
        fetchCandles: vi.fn(),
        openKlineStream: vi.fn(() => () => undefined),
        openTradeStream: vi.fn((_pairs, handlers) => {
          streamHandlers.push(handlers);
          const closeStream = closeStreams[streamIndex];
          streamIndex += 1;
          return closeStream ?? (() => undefined);
        }),
      };
      const service = new MarketTickService({
        exchangeAdapter,
        reconnectPolicy: { initialDelayMs: 25, maxDelayMs: 25 },
      });

      const subscription = await service.subscribe(
        { pair: 'BTCUSDT' },
        { onStatus },
      );
      streamHandlers[0]?.onError?.(new Error('trade stream dropped'));
      await vi.advanceTimersByTimeAsync(25);

      expect(exchangeAdapter.openTradeStream).toHaveBeenCalledTimes(2);
      expect(closeStreams[0]).toHaveBeenCalledOnce();
      expect(onStatus).toHaveBeenLastCalledWith('LIVE');

      await subscription.unsubscribe();
      expect(closeStreams[1]).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
