import { describe, expect, it } from 'vitest';

import { toMarketChartData } from '../../../../src/features/market-data/charting/marketChartData';

describe('toMarketChartData', () => {
  it('keeps the chart model independent from transport and renderer types', () => {
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

    const data = toMarketChartData(
      [candle],
      [
        {
          pair: 'BTCUSDT',
          timeframe: '1m',
          candle,
          indicators: { MA_20: 100.5 },
          signal: { action: 'SELL' },
        },
      ],
    );

    expect(data.candles).toEqual([
      {
        close: 101,
        high: 102,
        isClosed: true,
        low: 99,
        open: 100,
        time: 1_756_000_000,
      },
    ]);
    expect(data.lines[0]?.points).toEqual([
      { time: 1_756_000_000, value: 100.5 },
    ]);
    expect(data.markers[0]?.position).toBe('aboveBar');
    expect(data.volume[0]?.color).toBe('#10b981');
  });
});
