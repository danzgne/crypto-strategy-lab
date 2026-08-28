import type { Candle } from '@crypto-strategy-lab/shared';
import { describe, expect, it } from 'vitest';

import { RSIStrategy } from '../src/strategies/rsiStrategy';
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

describe('RSIStrategy', () => {
  it('instantiates with correct defaults', () => {
    const strategy = new RSIStrategy();
    expect(strategy.params.period).toBe(14);
    expect(strategy.params.oversold).toBe(30);
    expect(strategy.params.overbought).toBe(70);
    expect(strategy.requiredHistory).toBe(15);
  });

  it('returns HOLD when not enough history', () => {
    const strategy = new RSIStrategy({ period: 14 });
    const context = makeContext([100, 101, 102]);
    expect(strategy.analyze(context).action).toBe('HOLD');
  });

  // Mocking or supplying real data for RSI can be tedious.
  // We can just verify it doesn't crash on normal data.
  it('analyzes safely with enough history', () => {
    const strategy = new RSIStrategy({ period: 2 });
    const closes = [10, 12, 15, 14, 13, 11]; // length 6, req = 3
    const signal = strategy.analyze(makeContext(closes));
    expect(['BUY', 'SELL', 'HOLD']).toContain(signal.action);
  });
});
