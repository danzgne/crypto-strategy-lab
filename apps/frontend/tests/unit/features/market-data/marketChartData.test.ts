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
          indicators: { MA_20: 100.5, RSI: 42 },
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
    expect(data.lines.find((line) => line.id === 'MA_20')?.pane).toBe(0);
    expect(data.lines.find((line) => line.id === 'RSI')?.pane).toBe(1);
    expect(data.markers[0]?.position).toBe('aboveBar');
    expect(data.volume[0]?.color).toBe('#10b981');
  });

  it('routes RSI to its own pane and leaves other indicators on the price pane', () => {
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
          indicators: { RSI: 25, MA_20: 100.5 },
          signal: { action: 'BUY' },
        },
      ],
    );

    expect(data.lines.find((line) => line.id === 'RSI')?.pane).toBe(1);
    expect(data.lines.find((line) => line.id === 'MA_20')?.pane).toBe(0);
  });

  it('preserves a prepended history page instead of limiting the chart to the initial snapshot', () => {
    const firstOpenTime = 1_756_000_000_000;
    const candles = Array.from({ length: 501 }, (_, index) => ({
      pair: 'BTCUSDT' as const,
      timeframe: '1m' as const,
      openTime: firstOpenTime + index * 60_000,
      closeTime: firstOpenTime + index * 60_000 + 59_999,
      open: 100 + index,
      high: 101 + index,
      low: 99 + index,
      close: 100.5 + index,
      volume: 10,
      isClosed: true,
    }));

    const data = toMarketChartData(candles, []);

    expect(data.candles).toHaveLength(501);
    expect(data.candles[0]?.time).toBe(firstOpenTime / 1_000);
  });
});
