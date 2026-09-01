import type { Candle } from '@crypto-strategy-lab/shared';
import { describe, expect, it, vi } from 'vitest';

import type { ExchangeAdapter } from '../../../../src/api/features/marketData/application/interfaces/exchangeAdapter.interface';
import { MarketDataService } from '../../../../src/api/features/marketData/application/services/marketDataService';

const INTERVAL = 60_000;

describe('MarketDataService.prepareHistoricalCandles', () => {
  it('fetches an end-exclusive range, prepends contiguous warm-up, and persists closed candles', async () => {
    const selected = [0, 1, 2].map((index) => makeCandle(index * INTERVAL));
    const warmup = [-2, -1].map((index) => makeCandle(index * INTERVAL));
    const fetchCandles = vi
      .fn<ExchangeAdapter['fetchCandles']>()
      .mockResolvedValueOnce(selected)
      .mockResolvedValueOnce(warmup);
    const upsertClosed = vi.fn().mockResolvedValue(undefined);
    const service = new MarketDataService({
      exchangeAdapter: {
        fetchCandles,
        openKlineStream: vi.fn(() => () => undefined),
      },
      candleRepository: { upsertClosed },
    });

    const result = await service.prepareHistoricalCandles(
      {
        endTime: 3 * INTERVAL,
        pair: 'BTCUSDT',
        startTime: 0,
        timeframe: '1m',
      },
      2,
      100,
    );

    expect(fetchCandles).toHaveBeenNthCalledWith(1, {
      endTime: 2 * INTERVAL,
      limit: 100,
      pair: 'BTCUSDT',
      startTime: 0,
      timeframe: '1m',
    });
    expect(fetchCandles).toHaveBeenNthCalledWith(2, {
      endTime: -INTERVAL,
      limit: 2,
      pair: 'BTCUSDT',
      startTime: -2 * INTERVAL,
      timeframe: '1m',
    });
    expect(result).toEqual({
      candles: [...warmup, ...selected],
      selectedCandles: selected,
      warmupCandleCount: 2,
    });
    expect(upsertClosed).toHaveBeenCalledTimes(5);
    expect(upsertClosed.mock.calls.map(([candle]) => candle.openTime)).toEqual([
      -2 * INTERVAL,
      -INTERVAL,
      0,
      INTERVAL,
      2 * INTERVAL,
    ]);
  });

  it('rejects forming or missing selected candles before preparing warm-up', async () => {
    const fetchCandles = vi
      .fn<ExchangeAdapter['fetchCandles']>()
      .mockResolvedValue([
        makeCandle(0),
        { ...makeCandle(INTERVAL), isClosed: false },
        makeCandle(2 * INTERVAL),
      ]);
    const service = new MarketDataService({
      exchangeAdapter: {
        fetchCandles,
        openKlineStream: vi.fn(() => () => undefined),
      },
      candleRepository: { upsertClosed: vi.fn() },
    });

    await expect(
      service.prepareHistoricalCandles(
        {
          endTime: 3 * INTERVAL,
          pair: 'BTCUSDT',
          startTime: 0,
          timeframe: '1m',
        },
        2,
        100,
      ),
    ).rejects.toThrow(/closed|incomplete/i);
    expect(fetchCandles).toHaveBeenCalledOnce();
  });

  it('paginates warm-up history beyond one exchange page', async () => {
    const warmup = Array.from({ length: 1_001 }, (_, index) =>
      makeCandle((index - 1_001) * INTERVAL),
    );
    const selected = [makeCandle(0)];
    const fetchCandles = vi.fn<ExchangeAdapter['fetchCandles']>(
      async (query) => {
        if (query.startTime === 0) return selected;
        if (query.startTime === -1_001 * INTERVAL) {
          return warmup.slice(0, 1_000);
        }
        if (query.startTime === -INTERVAL) return warmup.slice(1_000);
        throw new Error(`Unexpected candle page at ${query.startTime}`);
      },
    );
    const service = new MarketDataService({
      exchangeAdapter: {
        fetchCandles,
        openKlineStream: vi.fn(() => () => undefined),
      },
      candleRepository: { upsertClosed: vi.fn().mockResolvedValue(undefined) },
    });

    const result = await service.prepareHistoricalCandles(
      {
        endTime: INTERVAL,
        pair: 'BTCUSDT',
        startTime: 0,
        timeframe: '1m',
      },
      1_001,
      100,
    );

    expect(fetchCandles).toHaveBeenCalledTimes(3);
    expect(result.warmupCandleCount).toBe(1_001);
    expect(result.candles).toEqual([...warmup, ...selected]);
  });

  it('rejects unaligned or oversized ranges before calling the exchange', async () => {
    const fetchCandles = vi.fn<ExchangeAdapter['fetchCandles']>();
    const service = new MarketDataService({
      exchangeAdapter: {
        fetchCandles,
        openKlineStream: vi.fn(() => () => undefined),
      },
      candleRepository: { upsertClosed: vi.fn() },
    });

    await expect(
      service.prepareHistoricalCandles(
        {
          endTime: 2 * INTERVAL + 1,
          pair: 'BTCUSDT',
          startTime: 0,
          timeframe: '1m',
        },
        0,
        100,
      ),
    ).rejects.toThrow(/aligned/i);
    await expect(
      service.prepareHistoricalCandles(
        {
          endTime: 101 * INTERVAL,
          pair: 'BTCUSDT',
          startTime: 0,
          timeframe: '1m',
        },
        0,
        100,
      ),
    ).rejects.toThrow(/limit/i);
    expect(fetchCandles).not.toHaveBeenCalled();
  });
});

function makeCandle(openTime: number): Candle {
  return {
    close: 100,
    closeTime: openTime + INTERVAL - 1,
    high: 101,
    isClosed: true,
    low: 99,
    open: 100,
    openTime,
    pair: 'BTCUSDT',
    timeframe: '1m',
    volume: 10,
  };
}
