import { describe, expect, it } from 'vitest';

import { StrategyRegistry } from '../../src/registry';
import {
  RULE_STRATEGY_ID,
  RuleStrategy,
  isRuleStrategy,
} from '../../src/rules/ruleStrategy';
import { makeContext } from '../testUtils';

const RSI_OVERSOLD_LONG = {
  indicators: [{ name: 'RSI' as const, period: 2 }],
  conditions: {
    long: [{ indicator: 'RSI', operator: '<' as const, value: 30 }],
    short: [],
  },
  timeframe: '1m' as const,
};

describe('RuleStrategy', () => {
  it('registers once via StrategyRegistry like a hand-written strategy', () => {
    expect(StrategyRegistry.list()).toContain(RULE_STRATEGY_ID);
    const strategy = StrategyRegistry.create(
      RULE_STRATEGY_ID,
      RSI_OVERSOLD_LONG,
    );
    expect(strategy).toBeInstanceOf(RuleStrategy);
    expect(isRuleStrategy(strategy)).toBe(true);
  });

  it('returns HOLD when there is not enough history yet', () => {
    const strategy = new RuleStrategy(RSI_OVERSOLD_LONG);
    const context = makeContext(Array(3).fill(100));
    expect(strategy.analyze(context).action).toBe('HOLD');
  });

  it('fires BUY only on the candle where RSI crosses below the threshold, with a reason', () => {
    const strategy = new RuleStrategy(RSI_OVERSOLD_LONG);
    // RSI period 2 -> requiredHistory 4: a mid-range RSI followed by a sharp drop crosses below 30.
    const closes = [100, 105, 100, 50];
    const signal = strategy.analyze(makeContext(closes));
    expect(signal.action).toBe('BUY');
    expect(signal.indicators?.['RSI']).toBeLessThan(30);
    expect(signal.reason).toBe('RSI < 30');

    // The next closed candle still has RSI below 30: it does not re-fire.
    const holdSignal = strategy.analyze(makeContext([...closes, 49]));
    expect(holdSignal.action).toBe('HOLD');
  });

  it('compares an indicator against another declared indicator, e.g. close below BB_Lower', () => {
    const strategy = new RuleStrategy({
      indicators: [{ name: 'BollingerBands', period: 5, stdDev: 1 }],
      conditions: {
        long: [{ indicator: 'Close', operator: '<', indicatorRef: 'BB_Lower' }],
        short: [],
      },
      timeframe: '1m',
    });
    const context = makeContext([100, 100, 100, 100, 100, 50]);
    const signal = strategy.analyze(context);
    expect(signal.action).toBe('BUY');
    expect(signal.reason).toBe('Close < BB_Lower');
  });

  it('combines multiple conditions per direction as a flat AND', () => {
    const strategy = new RuleStrategy({
      indicators: [
        { name: 'RSI', period: 2 },
        { name: 'SMA', period: 2, as: 'SMA_REF' },
      ],
      conditions: {
        long: [
          { indicator: 'RSI', operator: '<', value: 30 },
          { indicator: 'Close', operator: '>', indicatorRef: 'SMA_REF' },
        ],
        short: [],
      },
      timeframe: '1m',
    });
    // RSI drops below 30 here, but close (50) stays well below the SMA of the decline: AND fails.
    const closes = [100, 105, 100, 50];
    expect(strategy.analyze(makeContext(closes)).action).toBe('HOLD');
  });

  it('allows a long-only strategy: an empty short list never emits SELL', () => {
    const strategy = new RuleStrategy({
      indicators: [{ name: 'RSI', period: 2 }],
      conditions: {
        long: [{ indicator: 'RSI', operator: '<', value: 30 }],
        short: [],
      },
      timeframe: '1m',
    });
    // A sharp rise that would cross RSI above any overbought threshold, if short had one.
    const closes = [50, 45, 50, 100];
    expect(strategy.analyze(makeContext(closes)).action).not.toBe('SELL');
  });

  it('rejects both directions empty at construction', () => {
    expect(
      () =>
        new RuleStrategy({
          indicators: [{ name: 'RSI', period: 2 }],
          conditions: { long: [], short: [] },
          timeframe: '1m',
        }),
    ).toThrow(/at least one condition/i);
  });

  it('emits HOLD with a contradiction reason when long and short both fire on the same candle', () => {
    const strategy = new RuleStrategy({
      indicators: [{ name: 'RSI', period: 2 }],
      conditions: {
        // The same sharp drop crosses RSI below 30 and Close below 60 on one candle.
        long: [{ indicator: 'RSI', operator: '<', value: 30 }],
        short: [{ indicator: 'Close', operator: '<', value: 60 }],
      },
      timeframe: '1m',
    });
    const signal = strategy.analyze(makeContext([100, 105, 100, 50]));
    expect(signal.action).toBe('HOLD');
    expect(signal.reason).toContain('long and short both fired');
  });

  it('resolves riskManagement onto the flat stopLoss/takeProfit ratios', () => {
    const strategy = new RuleStrategy({
      ...RSI_OVERSOLD_LONG,
      riskManagement: {
        stopLoss: { type: 'percent', value: 2 },
        takeProfit: { type: 'percent', value: 5 },
      },
    });
    expect(strategy.params.stopLoss).toBe(0.02);
    expect(strategy.params.takeProfit).toBe(0.05);
  });

  it('restricts applicability to the declared pairs when given', () => {
    const strategy = new RuleStrategy({
      ...RSI_OVERSOLD_LONG,
      applicability: { pairs: ['btcusdt'] },
    });
    expect(strategy.params.applicability).toEqual({ pairs: ['BTCUSDT'] });
  });
});
