import { describe, expect, it } from 'vitest';

import { SRStrategy } from '../src/strategies/srStrategy';
import { makeContext } from './testUtils';

describe('SRStrategy', () => {
  it('instantiates with correct defaults', () => {
    const strategy = new SRStrategy();
    expect(strategy.params.n).toBe(10);
    expect(strategy.params.levelsTracked).toBe(3);
    expect(strategy.params.tolerance).toBe(0.005);
    // n * 10 = 100
    expect(strategy.requiredHistory).toBe(100);
  });

  it('returns HOLD when not enough history', () => {
    const strategy = new SRStrategy({ n: 2 });
    const context = makeContext([100, 101, 102]);
    expect(strategy.analyze(context).action).toBe('HOLD');
  });

  it('emits BUY when current close is near a tracked support pivot', () => {
    const strategy = new SRStrategy({
      n: 2,
      levelsTracked: 3,
      tolerance: 0.05,
    });

    // We need 3 support pivots (local minimums within window of n=2 on each side).
    // n=2 means we need [high, high, LOW, high, high]. That's 5 candles per pivot.
    // Let's build an array with 3 local minimums:
    // P1: 100, 95, 90 (S1), 95, 100
    // P2: 110, 105, 100 (S2), 105, 110
    // P3: 120, 115, 110 (S3), 115, 120
    // C: 110 (near S3, within 5% tolerance -> 110 * 0.05 = 5.5, so 110 is exactly on S3)

    const padding = Array(10).fill(100);
    const closes = [
      ...padding,
      100,
      95,
      90,
      95,
      100, // Pivot 1: 90
      110,
      105,
      100,
      105,
      110, // Pivot 2: 100
      120,
      115,
      110,
      115,
      120, // Pivot 3: 110
      110, // Current close
    ];

    const context = makeContext(closes);
    const signal = strategy.analyze(context);
    expect(signal.action).toBe('BUY');
    expect(signal.indicators?.['SUPPORT_1']).toBeDefined();
    expect(signal.indicators?.['SUPPORT_2']).toBeDefined();
    expect(signal.indicators?.['SUPPORT_3']).toBeDefined();
  });
});
