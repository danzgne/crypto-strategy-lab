import { describe, expect, it, vi } from 'vitest';

import type {
  Signal,
  Strategy,
  StrategyContext,
} from '@crypto-strategy-lab/shared';

import {
  assertStrategyApplicable,
  CombinationEngine,
  CombinationValidationError,
} from '../src';

const context: StrategyContext = {
  candles: [],
  pair: 'BTCUSDT',
  timeframe: '1m',
  sentiment: {
    positive: 0,
    neutral: 0,
    negative: 0,
    score: 0,
    sampleSize: 0,
  },
};

describe('CombinationEngine', () => {
  it('evaluates every member once with the same context and applies strict-majority voting', () => {
    const buy = makeStrategy('buy', { action: 'BUY' });
    const hold = makeStrategy('hold', { action: 'HOLD' });
    const sell = makeStrategy('sell', { action: 'SELL' });
    const composite = new CombinationEngine().assemble({
      members: [buy, hold, sell],
      mode: 'majority',
    });

    expect(composite.analyze(context)).toEqual({ action: 'HOLD', strength: 0 });
    expect(buy.analyze).toHaveBeenCalledOnce();
    expect(hold.analyze).toHaveBeenCalledOnce();
    expect(sell.analyze).toHaveBeenCalledOnce();
    expect(buy.analyze).toHaveBeenCalledWith(context);
    expect(hold.analyze).toHaveBeenCalledWith(context);
    expect(sell.analyze).toHaveBeenCalledWith(context);
  });

  it('reports the winning vote share for a directional majority', () => {
    const composite = new CombinationEngine().assemble({
      members: [
        makeStrategy('buy-1', { action: 'BUY' }),
        makeStrategy('buy-2', { action: 'BUY' }),
        makeStrategy('sell-1', { action: 'SELL' }),
      ],
      mode: 'majority',
    });

    expect(composite.analyze(context)).toEqual({
      action: 'BUY',
      strength: 2 / 3,
    });
  });

  it('normalizes weighted members, treats omitted strength as one, and holds at the threshold boundary', () => {
    const engine = new CombinationEngine();
    const composite = engine.assemble({
      members: [
        { strategy: makeStrategy('buy', { action: 'BUY' }), weight: 3 },
        { strategy: makeStrategy('hold', { action: 'HOLD' }), weight: 7 },
      ],
      mode: 'weighted',
      threshold: 0.3,
    });

    expect(
      composite.members.find((member) => member.strategyId === 'buy')?.weight,
    ).toBe(0.3);
    expect(
      composite.members.find((member) => member.strategyId === 'hold')?.weight,
    ).toBe(0.7);
    expect(
      composite.members.reduce((total, member) => total + member.weight, 0),
    ).toBe(1);
    expect(composite.analyze(context)).toEqual({ action: 'HOLD', strength: 0 });
  });

  it('uses weighted score and member strength for strict directional decisions', () => {
    const composite = new CombinationEngine().assemble({
      members: [
        {
          strategy: makeStrategy('buy', { action: 'BUY', strength: 0.8 }),
          weight: 3,
        },
        { strategy: makeStrategy('sell', { action: 'SELL' }), weight: 1 },
      ],
      mode: 'weighted',
      threshold: 0.3,
    });

    const signal = composite.analyze(context);
    expect(signal).toMatchObject({ action: 'BUY' });
    expect(signal.strength).toBeCloseTo(0.35);
  });

  it('does not round a weighted score before applying the strict threshold', () => {
    const composite = new CombinationEngine().assemble({
      members: [
        {
          strategy: makeStrategy('buy', {
            action: 'BUY',
            strength: 0.3000000000000001,
          }),
          weight: 1,
        },
        { strategy: makeStrategy('hold', { action: 'HOLD' }), weight: 0 },
      ],
      mode: 'weighted',
      threshold: 0.3,
    });

    expect(composite.analyze(context)).toEqual({
      action: 'BUY',
      strength: 0.3000000000000001,
    });
  });

  it('canonicalizes member order while changing member versions, weights, or threshold', () => {
    const ma = makeStrategy('ma', { action: 'BUY' }, { fast: 20, slow: 50 });
    const rsi = makeStrategy(
      'rsi',
      { action: 'HOLD' },
      { period: 14, oversold: 30, overbought: 70 },
    );
    const engine = new CombinationEngine();

    const left = engine.assemble({
      members: [
        { strategy: ma, weight: 2 },
        { strategy: rsi, weight: 1 },
      ],
      mode: 'weighted',
      threshold: 0.3,
    });
    const right = engine.assemble({
      members: [
        { strategy: rsi, weight: 1 },
        { strategy: ma, weight: 2 },
      ],
      mode: 'weighted',
      threshold: 0.3,
    });

    expect(left.identity).toBe(right.identity);
    expect(left.displayName).toContain('MA[fast=20,slow=50]');
    expect(left.displayName).toContain(
      'RSI[period=14,oversold=30,overbought=70]',
    );
    expect(left.displayName).toContain('weighted');

    expect(
      engine.assemble({
        members: [
          {
            strategy: makeStrategy('ma', { action: 'BUY' }, { fast: 10 }),
            weight: 2,
          },
          { strategy: rsi, weight: 1 },
        ],
        mode: 'weighted',
        threshold: 0.3,
      }).identity,
    ).not.toBe(left.identity);
    expect(
      engine.assemble({
        members: [ma, rsi],
        mode: 'weighted',
        threshold: 0.3000000000000001,
      }).identity,
    ).not.toBe(left.identity);
    expect(
      engine.assemble({
        members: [
          { strategy: ma, weight: 1 },
          { strategy: rsi, weight: 2 },
        ],
        mode: 'weighted',
        threshold: 0.3,
      }).identity,
    ).not.toBe(left.identity);
    expect(
      engine.assemble({
        members: [ma, rsi],
        mode: 'weighted',
        threshold: 0.4,
      }).identity,
    ).not.toBe(left.identity);
  });

  it.each([
    ['empty', [], 'at least 2'],
    [
      'single member',
      [makeStrategy('single', { action: 'HOLD' })],
      'at least 2',
    ],
  ])(
    'rejects a %s definition with a clear reason',
    (_name, members, reason) => {
      expect(() =>
        new CombinationEngine().assemble({
          members,
          mode: 'weighted',
        }),
      ).toThrow(new RegExp(reason, 'i'));
    },
  );

  it('rejects duplicate versions, invalid weights, and invalid thresholds at assembly', () => {
    const strategy = makeStrategy('same', { action: 'HOLD' });
    const engine = new CombinationEngine();

    expect(() =>
      engine.assemble({
        members: [strategy, strategy],
        mode: 'majority',
      }),
    ).toThrow(/duplicate/i);
    expect(() =>
      engine.assemble({
        members: [
          { strategy: makeStrategy('a', { action: 'HOLD' }), weight: 0 },
          { strategy: makeStrategy('b', { action: 'HOLD' }), weight: 0 },
        ],
        mode: 'weighted',
      }),
    ).toThrow(/total weight/i);
    expect(() =>
      engine.assemble({
        members: [
          {
            strategy: makeStrategy('a', { action: 'HOLD' }),
            weight: Number.NaN,
          },
          { strategy: makeStrategy('b', { action: 'HOLD' }), weight: 1 },
        ],
        mode: 'weighted',
      }),
    ).toThrow(/finite/i);
    expect(() =>
      engine.assemble({
        members: [
          {
            strategy: makeStrategy('a', { action: 'HOLD' }),
            weight: null as never,
          },
          { strategy: makeStrategy('b', { action: 'HOLD' }), weight: 1 },
        ],
        mode: 'weighted',
      }),
    ).toThrow(/finite/i);
    expect(() =>
      engine.assemble({
        members: [
          makeStrategy('a', { action: 'HOLD' }),
          makeStrategy('b', { action: 'HOLD' }),
        ],
        mode: 'weighted',
        threshold: 1.1,
      }),
    ).toThrow(/threshold/i);
    expect(() =>
      engine.assemble({
        members: [
          makeStrategy('a', { action: 'HOLD' }),
          makeStrategy('b', { action: 'HOLD' }),
        ],
        mode: 'weighted',
        threshold: null as never,
      }),
    ).toThrow(/threshold/i);
  });

  it('keeps normalized weights non-negative for tiny trailing weights', () => {
    const composite = new CombinationEngine().assemble({
      members: [
        {
          strategy: makeStrategy('a', { action: 'HOLD' }),
          weight: 1.3716641706396553e101,
        },
        {
          strategy: makeStrategy('b', { action: 'HOLD' }),
          weight: 2.208505857185803e100,
        },
        {
          strategy: makeStrategy('c', { action: 'HOLD' }),
          weight: 4.04390605594258e-65,
        },
      ],
      mode: 'weighted',
    });

    expect(composite.members.every(({ weight }) => weight >= 0)).toBe(true);
    expect(
      composite.members.reduce((total, { weight }) => total + weight, 0),
    ).toBeCloseTo(1);
  });

  it('keeps the published composite definition deeply immutable', () => {
    const composite = new CombinationEngine().assemble({
      members: [
        makeStrategy('a', { action: 'HOLD' }, { nested: { value: 1 } }),
        makeStrategy('b', { action: 'HOLD' }),
      ],
      mode: 'majority',
    });
    const params = composite.members[0]?.params.nested as {
      value: number;
    };

    expect(Object.isFrozen(composite.params)).toBe(true);
    expect(Object.isFrozen(composite.members)).toBe(true);
    expect(Object.isFrozen(composite.members[0])).toBe(true);
    expect(Object.isFrozen(params)).toBe(true);
    expect(params.value).toBe(1);
  });

  it('rejects conflicting RuleStrategy applicability before execution', () => {
    const engine = new CombinationEngine();
    const first = makeRuleStrategy('rule-1', '1m', ['BTCUSDT']);
    const second = makeRuleStrategy('rule-2', '5m', ['BTCUSDT']);

    expect(() =>
      engine.assemble({
        members: [first, second],
        mode: 'majority',
      }),
    ).toThrow(CombinationValidationError);
    expect(() =>
      engine.assemble({
        members: [
          makeRuleStrategy('rule-1', '1m', ['BTCUSDT']),
          makeRuleStrategy('rule-2', '1m', ['ETHUSDT']),
        ],
        mode: 'majority',
      }),
    ).toThrow(/applicability/i);
    expect(() =>
      engine.assemble({
        members: [
          makeRuleStrategy('rule-1', '1m', ['BTCUSDT', 'ETHUSDT']),
          makeRuleStrategy('rule-2', '1m', ['ETHUSDT', 'BTCUSDT']),
        ],
        mode: 'majority',
      }),
    ).not.toThrow();
  });

  it('never rejects a pair on the USDT_ALL wildcard, regardless of which USDT pair (issue #103 follow-up)', () => {
    const strategy = makeStrategy(
      'rule',
      { action: 'HOLD' },
      { applicability: { pairs: 'USDT_ALL' }, timeframe: '1h' },
    );

    for (const pair of ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'] as const) {
      expect(() =>
        assertStrategyApplicable(strategy, pair, '1h'),
      ).not.toThrow();
    }
    expect(() => assertStrategyApplicable(strategy, 'BTCBUSD', '1h')).toThrow(
      /not applicable/i,
    );
  });

  it('matches a lowercase-stored applicable pair against an uppercase pair', () => {
    const strategy = makeStrategy(
      'rule',
      { action: 'HOLD' },
      { applicability: { pairs: ['btcusdt'] }, timeframe: '1h' },
    );

    expect(() =>
      assertStrategyApplicable(strategy, 'BTCUSDT', '1h'),
    ).not.toThrow();
  });

  it('lets member evaluation failures escape visibly instead of substituting HOLD', () => {
    const failure = new Error('member evaluation failed');
    const throwing = makeStrategy('throwing', failure);
    const safe = makeStrategy('safe', { action: 'HOLD' });
    const composite = new CombinationEngine().assemble({
      members: [throwing, safe],
      mode: 'majority',
    });

    expect(() => composite.analyze(context)).toThrow(failure);
    expect(throwing.analyze).toHaveBeenCalledOnce();
  });
});

function makeStrategy(
  id: string,
  result: Signal | Error,
  params: Record<string, unknown> = { fixture: id },
): Strategy {
  const analyze = vi.fn((_context: StrategyContext) => {
    if (result instanceof Error) throw result;
    return result;
  });
  return {
    id,
    params,
    requiredHistory: 1,
    analyze,
  };
}

function makeRuleStrategy(
  id: string,
  timeframe: '1m' | '5m',
  pairs: string[],
): Strategy {
  return makeStrategy(
    'rule',
    { action: 'HOLD' },
    { id, timeframe, applicability: { pairs } },
  );
}
