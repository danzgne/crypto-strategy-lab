import type {
  Candle,
  CandleQuery,
  CandleUpdateMetadata,
} from '@crypto-strategy-lab/shared';
import { MAX_CANDLE_LIMIT } from '@crypto-strategy-lab/shared/market-data';
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

  it('reconnects with backoff, backfills from the previous closed candle, and emits overlap once', async () => {
    vi.useFakeTimers();
    try {
      const recoveryClosedCandle: Candle = {
        ...formingCandle,
        close: 101.25,
        isClosed: true,
      };
      const recoveryFormingCandle: Candle = {
        ...recoveryClosedCandle,
        openTime: recoveryClosedCandle.openTime + 60_000,
        closeTime: recoveryClosedCandle.closeTime + 60_000,
        open: 101.25,
        high: 102,
        low: 101,
        close: 101.75,
        volume: 14,
        isClosed: false,
      };
      const streamHandlers: Array<
        Parameters<ExchangeAdapter['openKlineStream']>[1]
      > = [];
      const closeStream = vi.fn();
      const fetchCandles = vi
        .fn<ExchangeAdapter['fetchCandles']>()
        .mockResolvedValueOnce([historyCandle, formingCandle])
        .mockResolvedValueOnce([
          historyCandle,
          recoveryClosedCandle,
          recoveryFormingCandle,
        ]);
      const exchangeAdapter: ExchangeAdapter = {
        fetchCandles,
        openKlineStream: vi.fn((_keys, handlers) => {
          streamHandlers.push(handlers);
          return closeStream;
        }),
      };
      const candleRepository = {
        upsertClosed: vi.fn().mockResolvedValue(undefined),
      };
      const onCandle = vi.fn();
      const onStatus = vi.fn();
      const service = new MarketDataService({
        exchangeAdapter,
        candleRepository,
        reconnectPolicy: { initialDelayMs: 25, maxDelayMs: 100 },
        now: () => recoveryFormingCandle.closeTime,
      });

      const subscription = await service.subscribe(
        { pair: 'BTCUSDT', timeframe: '1m', limit: 10 },
        { onCandle, onStatus },
      );

      streamHandlers[0]?.onStatus?.('RECONNECTING');
      await vi.advanceTimersByTimeAsync(25);

      expect(fetchCandles).toHaveBeenNthCalledWith(2, {
        pair: 'BTCUSDT',
        timeframe: '1m',
        limit: MAX_CANDLE_LIMIT,
        startTime: historyCandle.openTime - 60_000,
        endTime: expect.any(Number),
      });
      expect(exchangeAdapter.openKlineStream).toHaveBeenCalledTimes(2);
      expect(onStatus).toHaveBeenCalledWith('RECONNECTING');
      expect(onStatus).toHaveBeenLastCalledWith('LIVE');
      expect(onCandle).toHaveBeenCalledTimes(2);
      expect(onCandle).toHaveBeenNthCalledWith(1, recoveryClosedCandle);
      expect(onCandle).toHaveBeenNthCalledWith(2, recoveryFormingCandle);

      const recoveredSnapshot = await service.subscribe({
        pair: 'BTCUSDT',
        timeframe: '1m',
        limit: 10,
      });
      expect(recoveredSnapshot.candles).toEqual([
        historyCandle,
        recoveryClosedCandle,
        recoveryFormingCandle,
      ]);

      await recoveredSnapshot.unsubscribe();
      await subscription.unsubscribe();
      expect(closeStream).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps confirmed candles and remains stale when recovery backfill fails', async () => {
    vi.useFakeTimers();
    try {
      const streamHandlers: Array<
        Parameters<ExchangeAdapter['openKlineStream']>[1]
      > = [];
      const closeStream = vi.fn();
      const exchangeAdapter: ExchangeAdapter = {
        fetchCandles: vi
          .fn<ExchangeAdapter['fetchCandles']>()
          .mockResolvedValueOnce([historyCandle])
          .mockRejectedValueOnce(new Error('Binance unavailable')),
        openKlineStream: vi.fn((_keys, handlers) => {
          streamHandlers.push(handlers);
          return closeStream;
        }),
      };
      const onCandle = vi.fn();
      const onStatus = vi.fn();
      const service = new MarketDataService({
        exchangeAdapter,
        candleRepository: {
          upsertClosed: vi.fn().mockResolvedValue(undefined),
        },
        reconnectPolicy: { initialDelayMs: 25, maxDelayMs: 25 },
      });

      const subscription = await service.subscribe(
        { pair: 'BTCUSDT', timeframe: '1m' },
        { onCandle, onStatus },
      );
      streamHandlers[0]?.onStatus?.('RECONNECTING');
      await vi.advanceTimersByTimeAsync(25);

      expect(subscription.candles).toEqual([historyCandle]);
      expect(onCandle).not.toHaveBeenCalled();
      expect(onStatus).toHaveBeenLastCalledWith('STALE');

      await subscription.unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps stale status when a non-empty recovery response contains a candle gap', async () => {
    vi.useFakeTimers();
    try {
      const gapCandle: Candle = {
        ...historyCandle,
        openTime: historyCandle.openTime + 120_000,
        closeTime: historyCandle.closeTime + 120_000,
        open: 102,
        high: 103,
        low: 101,
        close: 102.5,
        isClosed: true,
      };
      const streamHandlers: Array<
        Parameters<ExchangeAdapter['openKlineStream']>[1]
      > = [];
      const exchangeAdapter: ExchangeAdapter = {
        fetchCandles: vi
          .fn<ExchangeAdapter['fetchCandles']>()
          .mockResolvedValueOnce([historyCandle])
          .mockResolvedValueOnce([historyCandle, gapCandle]),
        openKlineStream: vi.fn((_keys, handlers) => {
          streamHandlers.push(handlers);
          return () => undefined;
        }),
      };
      const onCandle = vi.fn();
      const onStatus = vi.fn();
      const service = new MarketDataService({
        exchangeAdapter,
        candleRepository: {
          upsertClosed: vi.fn().mockResolvedValue(undefined),
        },
        reconnectPolicy: { initialDelayMs: 25, maxDelayMs: 25 },
        now: () => historyCandle.openTime + 120_000,
      });

      const subscription = await service.subscribe(
        { pair: 'BTCUSDT', timeframe: '1m' },
        { onCandle, onStatus },
      );
      streamHandlers[0]?.onStatus?.('RECONNECTING');
      await vi.advanceTimersByTimeAsync(25);

      expect(subscription.candles).toEqual([historyCandle]);
      expect(onCandle).not.toHaveBeenCalled();
      expect(onStatus).toHaveBeenLastCalledWith('STALE');

      await subscription.unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  it('fetches a requested time range in capped batches and deduplicates the result', async () => {
    const interval = 60_000;
    const startTime = 1_756_000_000_000;
    const makeCandle = (index: number): Candle => ({
      ...historyCandle,
      openTime: startTime + index * interval,
      closeTime: startTime + index * interval + interval - 1,
      open: 100 + index,
      high: 101 + index,
      low: 99 + index,
      close: 100.5 + index,
      isClosed: true,
    });
    const firstBatch = Array.from({ length: MAX_CANDLE_LIMIT }, (_, index) =>
      makeCandle(index),
    );
    const finalCandle = makeCandle(MAX_CANDLE_LIMIT);
    const fetchCandles = vi
      .fn<ExchangeAdapter['fetchCandles']>()
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce([finalCandle]);
    const service = new MarketDataService({
      exchangeAdapter: {
        fetchCandles,
        openKlineStream: vi.fn(() => () => undefined),
      },
      candleRepository: { upsertClosed: vi.fn().mockResolvedValue(undefined) },
    });

    const subscription = await service.subscribe({
      pair: 'BTCUSDT',
      timeframe: '1m',
      limit: MAX_CANDLE_LIMIT,
      startTime,
      endTime: finalCandle.closeTime,
    });

    expect(fetchCandles).toHaveBeenCalledTimes(2);
    expect(fetchCandles).toHaveBeenNthCalledWith(1, {
      pair: 'BTCUSDT',
      timeframe: '1m',
      limit: MAX_CANDLE_LIMIT,
      startTime,
      endTime: finalCandle.closeTime,
    });
    expect(fetchCandles).toHaveBeenNthCalledWith(2, {
      pair: 'BTCUSDT',
      timeframe: '1m',
      limit: MAX_CANDLE_LIMIT,
      startTime: startTime + MAX_CANDLE_LIMIT * interval,
      endTime: finalCandle.closeTime,
    });
    expect(subscription.candles).toHaveLength(MAX_CANDLE_LIMIT);
    expect(subscription.candles.at(-1)).toEqual(finalCandle);
    expect(
      new Set(subscription.candles.map(({ openTime }) => openTime)).size,
    ).toBe(MAX_CANDLE_LIMIT);

    await subscription.unsubscribe();
  });
});
