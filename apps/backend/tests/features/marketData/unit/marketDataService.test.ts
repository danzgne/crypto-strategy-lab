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
  it('keeps a subscription referenced when initial history fails and recovers later', async () => {
    vi.useFakeTimers();
    try {
      const recoveryFormingCandle: Candle = {
        ...formingCandle,
        close: 101.25,
        volume: 14,
      };
      const streamHandlers: Array<
        Parameters<ExchangeAdapter['openKlineStream']>[1]
      > = [];
      const closeStreams = [vi.fn(), vi.fn()];
      const fetchCandles = vi
        .fn<ExchangeAdapter['fetchCandles']>()
        .mockRejectedValueOnce(new Error('initial history unavailable'))
        .mockResolvedValueOnce([historyCandle, recoveryFormingCandle]);
      const exchangeAdapter: ExchangeAdapter = {
        fetchCandles,
        openKlineStream: vi.fn((_keys, handlers) => {
          streamHandlers.push(handlers);
          return closeStreams[streamHandlers.length - 1]!;
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
        { pair: 'BTCUSDT', timeframe: '1m', limit: 10 },
        { onCandle, onStatus },
      );

      expect(subscription.candles).toEqual([]);
      expect(onStatus).toHaveBeenLastCalledWith('STALE');

      await vi.advanceTimersByTimeAsync(25);

      expect(fetchCandles).toHaveBeenNthCalledWith(2, {
        pair: 'BTCUSDT',
        timeframe: '1m',
        limit: 10,
      });
      expect(exchangeAdapter.openKlineStream).toHaveBeenCalledTimes(2);
      expect(onStatus).toHaveBeenLastCalledWith('LIVE');
      expect(onCandle).toHaveBeenCalledWith(historyCandle);
      expect(onCandle).toHaveBeenCalledWith(recoveryFormingCandle);

      const recoveredSubscription = await service.subscribe({
        pair: 'BTCUSDT',
        timeframe: '1m',
        limit: 10,
      });
      expect(recoveredSubscription.candles).toEqual([
        historyCandle,
        recoveryFormingCandle,
      ]);

      await recoveredSubscription.unsubscribe();
      await subscription.unsubscribe();
      expect(closeStreams[0]).toHaveBeenCalledOnce();
      expect(closeStreams[1]).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a subscription referenced when initial stream setup fails and recovers later', async () => {
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
        openKlineStream: vi
          .fn<ExchangeAdapter['openKlineStream']>()
          .mockRejectedValueOnce(new Error('initial stream unavailable'))
          .mockImplementation((_keys, handlers) => {
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
        now: () => recoveryFormingCandle.closeTime,
      });

      const subscription = await service.subscribe(
        { pair: 'BTCUSDT', timeframe: '1m', limit: 10 },
        { onCandle, onStatus },
      );

      expect(subscription.candles).toEqual([historyCandle, formingCandle]);
      expect(onStatus).toHaveBeenLastCalledWith('STALE');

      await vi.advanceTimersByTimeAsync(25);

      expect(exchangeAdapter.openKlineStream).toHaveBeenCalledTimes(2);
      expect(fetchCandles).toHaveBeenNthCalledWith(2, {
        pair: 'BTCUSDT',
        timeframe: '1m',
        limit: MAX_CANDLE_LIMIT,
        startTime: historyCandle.openTime - 60_000,
        endTime: recoveryFormingCandle.closeTime,
      });
      expect(onStatus).toHaveBeenLastCalledWith('LIVE');
      expect(onCandle).toHaveBeenCalledWith(recoveryClosedCandle);
      expect(onCandle).toHaveBeenCalledWith(recoveryFormingCandle);

      await subscription.unsubscribe();
      expect(closeStream).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes a replacement stream when disposal happens during recovery backfill', async () => {
    vi.useFakeTimers();
    try {
      let resolveRecoveryHistory: (candles: Candle[]) => void = () => undefined;
      const pendingRecoveryHistory = new Promise<Candle[]>((resolve) => {
        resolveRecoveryHistory = resolve;
      });
      const streamHandlers: Array<
        Parameters<ExchangeAdapter['openKlineStream']>[1]
      > = [];
      const closeStreams = [vi.fn(), vi.fn()];
      let resolveRecoveryStreamOpened: () => void = () => undefined;
      const recoveryStreamOpened = new Promise<void>((resolve) => {
        resolveRecoveryStreamOpened = resolve;
      });
      const exchangeAdapter: ExchangeAdapter = {
        fetchCandles: vi
          .fn<ExchangeAdapter['fetchCandles']>()
          .mockRejectedValueOnce(new Error('initial history unavailable'))
          .mockReturnValueOnce(pendingRecoveryHistory),
        openKlineStream: vi.fn((_keys, handlers) => {
          streamHandlers.push(handlers);
          if (streamHandlers.length === 2) resolveRecoveryStreamOpened();
          return closeStreams[streamHandlers.length - 1]!;
        }),
      };
      const service = new MarketDataService({
        exchangeAdapter,
        candleRepository: {
          upsertClosed: vi.fn().mockResolvedValue(undefined),
        },
        reconnectPolicy: { initialDelayMs: 25, maxDelayMs: 25 },
      });

      const subscription = await service.subscribe({
        pair: 'BTCUSDT',
        timeframe: '1m',
        limit: 10,
      });
      streamHandlers[0]?.onStatus?.('RECONNECTING');
      await vi.advanceTimersByTimeAsync(25);
      await recoveryStreamOpened;

      const unsubscribePromise = subscription.unsubscribe();
      await Promise.resolve();
      expect(closeStreams[1]).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);

      resolveRecoveryHistory([historyCandle]);
      await unsubscribePromise;
      await service.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('contains initial degradation to the affected market subscription', async () => {
    vi.useFakeTimers();
    try {
      const ethCandle: Candle = { ...historyCandle, pair: 'ETHUSDT' };
      let btcHistoryAttempts = 0;
      const streamHandlers: Array<{
        pair: string;
        handlers: Parameters<ExchangeAdapter['openKlineStream']>[1];
      }> = [];
      const closeStreams = [vi.fn(), vi.fn(), vi.fn()];
      const exchangeAdapter: ExchangeAdapter = {
        fetchCandles: vi.fn(async (query: CandleQuery) => {
          if (query.pair === 'BTCUSDT' && btcHistoryAttempts++ === 0) {
            throw new Error('BTC history unavailable');
          }
          return query.pair === 'BTCUSDT' ? [historyCandle] : [ethCandle];
        }),
        openKlineStream: vi.fn((keys, handlers) => {
          const pair = keys[0]?.pair;
          if (pair === undefined) throw new Error('Expected one market key');
          streamHandlers.push({ pair, handlers });
          return closeStreams[streamHandlers.length - 1]!;
        }),
      };
      const btcStatus = vi.fn();
      const ethStatus = vi.fn();
      const service = new MarketDataService({
        exchangeAdapter,
        candleRepository: {
          upsertClosed: vi.fn().mockResolvedValue(undefined),
        },
        reconnectPolicy: { initialDelayMs: 25, maxDelayMs: 25 },
      });

      const btcSubscription = await service.subscribe(
        { pair: 'BTCUSDT', timeframe: '1m', limit: 10 },
        { onStatus: btcStatus },
      );
      const ethSubscription = await service.subscribe(
        { pair: 'ETHUSDT', timeframe: '1m', limit: 10 },
        { onStatus: ethStatus },
      );

      expect(btcSubscription.candles).toEqual([]);
      expect(ethSubscription.candles).toEqual([ethCandle]);
      expect(btcStatus).toHaveBeenLastCalledWith('STALE');
      expect(ethStatus).toHaveBeenLastCalledWith('LIVE');

      await vi.advanceTimersByTimeAsync(25);

      expect(btcStatus).toHaveBeenLastCalledWith('LIVE');
      expect(ethStatus).toHaveBeenLastCalledWith('LIVE');
      expect(exchangeAdapter.openKlineStream).toHaveBeenCalledTimes(3);

      await btcSubscription.unsubscribe();
      await ethSubscription.unsubscribe();
      expect(closeStreams[0]).toHaveBeenCalledOnce();
      expect(closeStreams[1]).toHaveBeenCalledOnce();
      expect(closeStreams[2]).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

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

  it('reports live again when the current stream delivers a candle after a transient error', async () => {
    vi.useFakeTimers();
    try {
      let streamHandlers:
        Parameters<ExchangeAdapter['openKlineStream']>[1] | undefined;
      const onCandle = vi.fn();
      const onStatus = vi.fn();
      const exchangeAdapter: ExchangeAdapter = {
        fetchCandles: vi.fn(async (_query: CandleQuery) => [
          historyCandle,
          formingCandle,
        ]),
        openKlineStream: vi.fn((_keys, handlers) => {
          streamHandlers = handlers;
          return () => undefined;
        }),
      };
      const service = new MarketDataService({
        exchangeAdapter,
        candleRepository: {
          upsertClosed: vi.fn().mockResolvedValue(undefined),
        },
        reconnectPolicy: { initialDelayMs: 1_000, maxDelayMs: 1_000 },
      });

      const subscription = await service.subscribe(
        { pair: 'BTCUSDT', timeframe: '1m', limit: 10 },
        { onCandle, onStatus },
      );

      streamHandlers?.onError?.(new Error('temporary exchange stream error'));
      await streamHandlers?.onCandle?.(bufferedUpdate);

      expect(onCandle).toHaveBeenCalledWith(bufferedUpdate);
      expect(onStatus).toHaveBeenLastCalledWith('LIVE');

      await subscription.unsubscribe();
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

  it('loads candles before a chart boundary and merges them into the active market state', async () => {
    const olderCandle: Candle = {
      ...historyCandle,
      openTime: historyCandle.openTime - 60_000,
      closeTime: historyCandle.closeTime - 60_000,
      open: 99,
      high: 100,
      low: 98,
      close: 99.5,
      volume: 9,
    };
    const fetchCandles = vi
      .fn<ExchangeAdapter['fetchCandles']>()
      .mockResolvedValueOnce([historyCandle])
      .mockResolvedValueOnce([olderCandle]);
    const candleRepository = {
      upsertClosed: vi.fn().mockResolvedValue(undefined),
    };
    const service = new MarketDataService({
      exchangeAdapter: {
        fetchCandles,
        openKlineStream: vi.fn(() => () => undefined),
      },
      candleRepository,
    });

    const subscription = await service.subscribe({
      pair: 'BTCUSDT',
      timeframe: '1m',
      limit: 10,
    });
    const loaded = await service.loadHistoryBefore(
      {
        pair: 'BTCUSDT',
        timeframe: '1m',
        limit: 10,
      },
      historyCandle.openTime,
    );

    expect(fetchCandles).toHaveBeenNthCalledWith(2, {
      pair: 'BTCUSDT',
      timeframe: '1m',
      limit: 10,
      endTime: historyCandle.openTime - 1,
    });
    expect(loaded).toEqual([olderCandle]);
    const merged = await service.subscribe({
      pair: 'BTCUSDT',
      timeframe: '1m',
      limit: 10,
    });
    expect(merged.candles).toEqual([olderCandle, historyCandle]);
    expect(candleRepository.upsertClosed).toHaveBeenCalledWith(olderCandle);

    await merged.unsubscribe();
    await subscription.unsubscribe();
  });
});
