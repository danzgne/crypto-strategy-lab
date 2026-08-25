import type {
  Candle,
  CandleQuery,
  CandleUpdateMetadata,
} from '@crypto-strategy-lab/shared';
import { describe, expect, it, vi } from 'vitest';

import type { ExchangeAdapter } from '../../../../src/api/features/marketData/application/interfaces/exchangeAdapter.interface';
import { MarketDataService } from '../../../../src/api/features/marketData/application/services/marketDataService';

const historyCandle: Candle = {
  pair: 'BTCUSDT',
  timeframe: '1m',
  openTime: 1_756_000_000_000,
  closeTime: 1_756_000_059_999,
  open: 100,
  high: 101,
  low: 99,
  close: 100.5,
  volume: 10,
  isClosed: true,
};

const formingCandle: Candle = {
  ...historyCandle,
  openTime: 1_756_000_060_000,
  closeTime: 1_756_000_119_999,
  isClosed: false,
};

const bufferedUpdate: Candle = {
  ...formingCandle,
  high: 102,
  close: 101.5,
  volume: 12,
};

describe('MarketDataService', () => {
  it('merges buffered stream updates after REST history and emits each market event once', async () => {
    let streamHandlers:
      Parameters<ExchangeAdapter['openKlineStream']>[1] | undefined;
    const closeStream = vi.fn();
    const exchangeAdapter: ExchangeAdapter = {
      fetchCandles: vi.fn(async (_query: CandleQuery) => [
        historyCandle,
        formingCandle,
      ]),
      openKlineStream: vi.fn((_keys, handlers) => {
        streamHandlers = handlers;
        handlers.onCandle(bufferedUpdate, {
          exchangeEventTime: 1_756_000_100_000,
        });
        return closeStream;
      }),
    };
    const candleRepository = {
      upsertClosed: vi.fn().mockResolvedValue(undefined),
    };
    const eventPublisher = { publish: vi.fn() };
    const onCandle = vi.fn();
    const service = new MarketDataService({
      exchangeAdapter,
      candleRepository,
      eventPublisher,
    });

    const subscription = await service.subscribe(
      { pair: 'btcusdt', timeframe: '1m', limit: 10 },
      onCandle,
    );

    expect(subscription.candles).toEqual([historyCandle, bufferedUpdate]);
    expect(candleRepository.upsertClosed).toHaveBeenCalledWith(historyCandle);
    expect(onCandle).toHaveBeenCalledWith(bufferedUpdate);
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'MarketPriceUpdated',
        payload: expect.objectContaining({
          pair: 'BTCUSDT',
          timeframe: '1m',
          openTime: bufferedUpdate.openTime,
          price: '101.5',
          exchangeEventTime: 1_756_000_100_000,
        }),
      }),
    );

    const closedUpdate: Candle = { ...bufferedUpdate, isClosed: true };
    const closedMetadata: CandleUpdateMetadata = {
      exchangeEventTime: 1_756_000_119_999,
    };
    await streamHandlers?.onCandle(closedUpdate, closedMetadata);
    await streamHandlers?.onCandle(closedUpdate, closedMetadata);

    expect(candleRepository.upsertClosed).toHaveBeenCalledTimes(2);
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'CandleClosed',
        payload: expect.objectContaining({
          pair: 'BTCUSDT',
          timeframe: '1m',
          openTime: closedUpdate.openTime,
          closeTime: closedUpdate.closeTime,
        }),
      }),
    );
    expect(
      eventPublisher.publish.mock.calls.filter(
        ([event]) => event.name === 'CandleClosed',
      ),
    ).toHaveLength(1);

    await subscription.unsubscribe();
    expect(closeStream).toHaveBeenCalledOnce();
  });
});
