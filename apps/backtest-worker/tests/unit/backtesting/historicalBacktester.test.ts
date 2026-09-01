import { describe, expect, it, vi } from 'vitest';

import type {
  Candle,
  Signal,
  Strategy,
  StrategyContext,
} from '@crypto-strategy-lab/shared';

import { HistoricalBacktester } from '../../../src/backtesting/historicalBacktester';

describe('HistoricalBacktester', () => {
  it('executes a closed-candle signal at the next candle open and force-closes the final position', () => {
    const analyze = vi.fn((context: StrategyContext): Signal =>
      context.candles.at(-1)?.openTime === 60_000
        ? { action: 'BUY' }
        : { action: 'HOLD' },
    );
    const strategy = makeStrategy(analyze);
    const result = new HistoricalBacktester().run({
      candles: candles(),
      endTime: 240_000,
      initialInvestment: 100,
      pair: 'BTCUSDT',
      slippage: 0,
      startTime: 60_000,
      strategy,
      timeframe: '1m',
      transactionCost: 0,
    });

    expect(analyze).toHaveBeenCalledTimes(4);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({
      direction: 'LONG',
      entryPrice: 110,
      entryTime: 120_000,
      exitPrice: 120,
      exitReason: 'FINAL_CANDLE',
      exitTime: 180_999,
      investment: 100,
      pair: 'BTCUSDT',
      profit: expect.closeTo(100 / 11),
      slippage: 0,
      stopLoss: null,
      takeProfit: null,
      transactionCost: 0,
    });
  });

  it('checks OHLC risk triggers intrabar and resolves a same-candle conflict to stop loss', () => {
    const result = new HistoricalBacktester().run({
      candles: candlesWithOverrides({
        120_000: { high: 120, low: 80 },
      }),
      endTime: 240_000,
      initialInvestment: 100,
      pair: 'BTCUSDT',
      slippage: 0,
      startTime: 60_000,
      strategy: makeStrategy(
        (context) =>
          context.candles.at(-1)?.openTime === 0
            ? { action: 'BUY' }
            : { action: 'HOLD' },
        { stopLoss: 0.1, takeProfit: 0.1 },
      ),
      timeframe: '1m',
      transactionCost: 0,
    });

    expect(result.trades[0]).toMatchObject({
      exitPrice: 90,
      exitReason: 'STOP_LOSS',
      stopLoss: 90,
      takeProfit: expect.closeTo(110),
    });
    expect(result.trades).toHaveLength(1);
  });

  it('supports short positions and applies independent reversal fills', () => {
    const result = new HistoricalBacktester().run({
      candles: candlesWithOverrides({
        120_000: { close: 112 },
        180_000: { close: 100 },
      }),
      endTime: 240_000,
      initialInvestment: 100,
      pair: 'BTCUSDT',
      slippage: 0,
      startTime: 60_000,
      strategy: makeStrategy((context) => {
        const openTime = context.candles.at(-1)?.openTime;
        return openTime === 0
          ? { action: 'BUY' }
          : openTime === 60_000
            ? { action: 'SELL' }
            : { action: 'HOLD' };
      }),
      timeframe: '1m',
      transactionCost: 0.01,
    });

    expect(result.trades).toHaveLength(2);
    expect(result.trades[0]).toMatchObject({
      direction: 'LONG',
      exitReason: 'SIGNAL',
    });
    expect(result.trades[1]).toMatchObject({
      direction: 'SHORT',
      exitReason: 'FINAL_CANDLE',
    });
    expect(result.trades[0]!.transactionCost).toBeGreaterThan(2);
    expect(result.trades[1]!.transactionCost).toBeGreaterThan(0);
  });

  it('stops opening positions after capital depletion', () => {
    const result = new HistoricalBacktester().run({
      candles: candlesWithOverrides({
        180_000: { close: 100 },
      }),
      endTime: 240_000,
      initialInvestment: 100,
      pair: 'BTCUSDT',
      slippage: 0,
      startTime: 60_000,
      strategy: makeStrategy((context) =>
        context.candles.at(-1)?.openTime === 0 ||
        context.candles.at(-1)?.openTime === 120_000
          ? { action: 'BUY' }
          : { action: 'HOLD' },
      ),
      timeframe: '1m',
      transactionCost: 0.99,
    });

    expect(result.trades).toHaveLength(1);
    expect(result.finalEquity).toBe(0);
  });
});

function candles(): Candle[] {
  return [
    makeCandle(0, 90, 95, 85, 92),
    makeCandle(60_000, 100, 105, 95, 102),
    makeCandle(120_000, 110, 115, 105, 112),
    makeCandle(180_000, 115, 125, 110, 120),
  ];
}

function candlesWithOverrides(
  overrides: Record<number, Partial<Candle>> = {},
): Candle[] {
  return candles().map((candle) => ({
    ...candle,
    ...(overrides[candle.openTime] ?? {}),
  }));
}

function makeCandle(
  openTime: number,
  open: number,
  high: number,
  low: number,
  close: number,
): Candle {
  return {
    close,
    closeTime: openTime + 999,
    high,
    isClosed: true,
    low,
    open,
    openTime,
    pair: 'BTCUSDT',
    timeframe: '1m',
    volume: 1,
  };
}

function makeStrategy(
  analyze: Strategy['analyze'],
  params: Readonly<Record<string, unknown>> = {},
): Strategy {
  return {
    analyze,
    id: 'fixture',
    params,
    requiredHistory: 1,
  };
}
