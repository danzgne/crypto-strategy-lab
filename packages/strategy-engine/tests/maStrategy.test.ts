import type { Candle } from '@crypto-strategy-lab/shared';
import { describe, expect, it } from 'vitest';

import { MAStrategy } from '../src/strategies/maStrategy';
import type { StrategyContext } from '../src/types';

const EMPTY_SENTIMENT = {
  positive: 0,
  neutral: 0,
  negative: 0,
  score: 0,
  sampleSize: 0,
} as const;

function makeContext(closes: number[]): StrategyContext {
  const candles: Candle[] = closes.map((close, index) => ({
    pair: 'BTCUSDT',
    timeframe: '1m',
    openTime: 1_756_000_000_000 + index * 60_000,
    closeTime: 1_756_000_059_999 + index * 60_000,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 10 + index,
    isClosed: true,
  }));

  return {
    candles,
    pair: 'BTCUSDT',
    timeframe: '1m',
    sentiment: EMPTY_SENTIMENT,
  };
}

describe('MAStrategy', () => {
  it('uses dual-SMA defaults and exposes risk parameters in its schema', () => {
    const strategy = new MAStrategy();

    expect(strategy.requiredHistory).toBe(51);
    expect(MAStrategy.paramsSchema.properties.fast).toMatchObject({
      type: 'integer',
      default: 20,
    });
    expect(MAStrategy.paramsSchema.properties.slow).toMatchObject({
      type: 'integer',
      default: 50,
    });
    expect(MAStrategy.paramsSchema.properties.stopLoss).toMatchObject({
      type: 'number',
    });
    expect(MAStrategy.paramsSchema.properties.takeProfit).toMatchObject({
      type: 'number',
    });
  });

  it('returns BUY only on a fast-SMA cross above the slow SMA', () => {
    const strategy = new MAStrategy({ fast: 3, slow: 5 });

    const signal = strategy.analyze(makeContext([10, 10, 10, 10, 10, 12]));

    expect(signal).toEqual({
      action: 'BUY',
      indicators: {
        MA_3: 10.666666666666666,
        MA_5: 10.4,
      },
    });
  });

  it('returns SELL only on a fast-SMA cross below the slow SMA', () => {
    const strategy = new MAStrategy({ fast: 3, slow: 5 });

    const signal = strategy.analyze(makeContext([12, 12, 12, 12, 12, 10]));

    expect(signal).toEqual({
      action: 'SELL',
      indicators: {
        MA_3: 11.333333333333334,
        MA_5: 11.6,
      },
    });
  });

  it('returns HOLD when the moving averages do not cross', () => {
    const strategy = new MAStrategy({ fast: 3, slow: 5 });

    expect(
      strategy.analyze(makeContext([10, 10, 10, 10, 10, 12, 13])),
    ).toMatchObject({ action: 'HOLD' });
  });
});
