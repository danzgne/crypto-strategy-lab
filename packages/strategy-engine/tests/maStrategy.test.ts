
import { describe, expect, it } from 'vitest';

import { MAStrategy } from '../src/strategies/maStrategy';
import { makeContext } from './testUtils';



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
