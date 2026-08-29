import { describe, expect, it } from 'vitest';

import { BBStrategy } from '../src/strategies/bbStrategy';
import { makeContext } from './testUtils';

describe('BBStrategy', () => {
  it('instantiates with correct defaults', () => {
    const strategy = new BBStrategy();
    expect(strategy.params.period).toBe(20);
    expect(strategy.params.stdDev).toBe(2);
    expect(strategy.requiredHistory).toBe(21);
  });

  it('returns HOLD when not enough history', () => {
    const strategy = new BBStrategy({ period: 20 });
    const context = makeContext(Array(20).fill(100)); // 20 candles
    expect(strategy.analyze(context).action).toBe('HOLD');
  });

  it('emits BUY when close crosses below lower band', () => {
    const strategy = new BBStrategy({ period: 5, stdDev: 1 });
    // period: 5 -> requiredHistory: 6
    // C0..C4 are around 100, so moving average is ~100
    // C5 drops significantly so it crosses below the lower band
    const context = makeContext([100, 100, 100, 100, 100, 50]);
    const signal = strategy.analyze(context);
    expect(signal.action).toBe('BUY');
    expect(signal.indicators?.['BB_LOWER']).toBeDefined();
  });

  it('emits SELL when close crosses above upper band', () => {
    const strategy = new BBStrategy({ period: 5, stdDev: 1 });
    const context = makeContext([100, 100, 100, 100, 100, 150]);
    const signal = strategy.analyze(context);
    expect(signal.action).toBe('SELL');
  });
});
