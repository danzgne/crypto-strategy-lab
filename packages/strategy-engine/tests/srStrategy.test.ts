import { describe, expect, it } from 'vitest';

import { SRStrategy } from '../src/strategies/srStrategy';
import { makeContext } from './testUtils';

describe('SRStrategy', () => {
  it('instantiates with correct defaults', () => {
    const strategy = new SRStrategy();
    expect(strategy.params.n).toBe(10);
    expect(strategy.params.levelsTracked).toBe(3);
    expect(strategy.params.tolerance).toBe(0.005);
    // (2n + 1) * levelsTracked = 63
    expect(strategy.requiredHistory).toBe(63);
  });

  it('returns HOLD when not enough history', () => {
    const strategy = new SRStrategy({ n: 2 });
    const context = makeContext([100, 101, 102]);
    expect(strategy.analyze(context).action).toBe('HOLD');
  });

  it('scales required history with the requested number of levels', () => {
    expect(new SRStrategy({ n: 2, levelsTracked: 1 }).requiredHistory).toBe(5);
    expect(new SRStrategy({ n: 2, levelsTracked: 4 }).requiredHistory).toBe(20);
  });

  it('rejects non-finite or non-positive tolerance values', () => {
    expect(() => new SRStrategy({ tolerance: Number.NaN })).toThrow(
      'finite positive',
    );
    expect(
      () => new SRStrategy({ tolerance: Number.POSITIVE_INFINITY }),
    ).toThrow('finite positive');
    expect(() => new SRStrategy({ tolerance: 0 })).toThrow('finite positive');
  });

  it('does not treat equal plateaus or ambiguous extrema as levels', () => {
    const plateauStrategy = new SRStrategy({
      n: 2,
      levelsTracked: 1,
      tolerance: 0.05,
    });
    const plateauSignal = plateauStrategy.analyze(
      makeContext([100, 90, 90, 100, 100, 100, 90]),
    );
    expect(plateauSignal.action).toBe('HOLD');
    expect(plateauSignal.indicators).toEqual({});

    const ambiguousStrategy = new SRStrategy({
      n: 2,
      levelsTracked: 1,
      tolerance: 0.05,
    });
    const context = makeContext([100, 101, 90, 101, 100, 90]);
    const ambiguousContext = {
      ...context,
      candles: context.candles.map((candle, index) =>
        index === 2
          ? { ...candle, high: 200, low: 1 }
          : { ...candle, high: 110, low: 80 },
      ),
    };
    const ambiguousSignal = ambiguousStrategy.analyze(ambiguousContext);
    expect(ambiguousSignal.action).toBe('HOLD');
    expect(ambiguousSignal.indicators).toEqual({});
  });

  it('emits BUY when current close is near a tracked support pivot', () => {
    const strategy = new SRStrategy({
      n: 2,
      levelsTracked: 3,
      tolerance: 0.01,
    });

    // We need 3 support pivots (local minimums within window of n=2 on each side).
    // n=2 means we need [high, high, LOW, high, high]. That's 5 candles per pivot.
    // Let's build an array with 3 local minimums:
    // P1: 100, 95, 90 (S1), 95, 100
    // P2: 110, 105, 100 (S2), 105, 110
    // P3: 120, 115, 110 (S3), 115, 120
    // C: 109 (exactly on S3 and outside the resistance tolerance)

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
      109, // Current close
    ];

    const context = makeContext(closes);
    const signal = strategy.analyze(context);
    expect(signal.action).toBe('BUY');
    expect(signal.indicators?.['SUPPORT_1']).toBeDefined();
    expect(signal.indicators?.['SUPPORT_2']).toBeDefined();
    expect(signal.indicators?.['SUPPORT_3']).toBeDefined();
  });
});
