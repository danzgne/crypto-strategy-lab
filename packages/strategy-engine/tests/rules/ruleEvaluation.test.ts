import { describe, expect, it } from 'vitest';

import {
  evaluateDirection,
  requiredHistoryForRule,
  resolveRuleStrategyParams,
} from '../../src/rules/ruleEvaluation';

describe('resolveRuleStrategyParams: indicators', () => {
  it('applies default periods and reference names per indicator', () => {
    const resolved = resolveRuleStrategyParams({
      source: 'manual',
      indicators: [
        { name: 'SMA' },
        { name: 'RSI' },
        { name: 'BollingerBands' },
      ],
      conditions: {
        long: [{ indicator: 'RSI', operator: '<', value: 30 }],
        short: [],
      },
      timeframe: '1m',
    });
    expect(resolved.indicators).toEqual([
      { name: 'SMA', refName: 'SMA', params: { period: 20 } },
      { name: 'RSI', refName: 'RSI', params: { period: 14 } },
      {
        name: 'BollingerBands',
        refName: 'BB',
        params: { period: 20, stdDev: 2 },
      },
    ]);
  });

  it('rejects an unknown indicator name', () => {
    expect(() =>
      resolveRuleStrategyParams({
        source: 'manual',
        indicators: [{ name: 'MACD' }],
        conditions: {
          long: [],
          short: [{ indicator: 'RSI', operator: '<', value: 30 }],
        },
        timeframe: '1m',
      }),
    ).toThrow(/unknown name/i);
  });

  it('rejects an unexpected key on an indicator declaration', () => {
    expect(() =>
      resolveRuleStrategyParams({
        source: 'manual',
        indicators: [{ name: 'SMA', position: 'top' }],
        conditions: {
          long: [],
          short: [{ indicator: 'Close', operator: '>', value: 1 }],
        },
        timeframe: '1m',
      }),
    ).toThrow(/unexpected key "position"/i);
  });

  it('rejects two indicators colliding on the same default reference', () => {
    expect(() =>
      resolveRuleStrategyParams({
        source: 'manual',
        indicators: [{ name: 'SMA' }, { name: 'SMA' }],
        conditions: {
          long: [{ indicator: 'SMA', operator: '>', value: 1 }],
          short: [],
        },
        timeframe: '1m',
      }),
    ).toThrow(/duplicate indicator reference/i);
  });

  it('allows two indicators of the same kind once disambiguated by alias', () => {
    const resolved = resolveRuleStrategyParams({
      source: 'manual',
      indicators: [
        { name: 'SMA', period: 20, as: 'SMA_FAST' },
        { name: 'SMA', period: 50, as: 'SMA_SLOW' },
      ],
      conditions: {
        long: [
          { indicator: 'SMA_FAST', operator: '>', indicatorRef: 'SMA_SLOW' },
        ],
        short: [],
      },
      timeframe: '1m',
    });
    expect(
      resolved.indicators.map((declaration) => declaration.refName),
    ).toEqual(['SMA_FAST', 'SMA_SLOW']);
  });
});

describe('resolveRuleStrategyParams: conditions', () => {
  const BASE = {
    source: 'manual' as const,
    indicators: [{ name: 'RSI' as const, period: 14 }],
    timeframe: '1m' as const,
  };

  it('resolves a literal-value condition', () => {
    const resolved = resolveRuleStrategyParams({
      ...BASE,
      conditions: {
        long: [{ indicator: 'RSI', operator: '<', value: 30 }],
        short: [],
      },
    });
    expect(resolved.conditions.long).toEqual([
      { indicator: 'RSI', operator: '<', value: 30 },
    ]);
  });

  it('resolves an indicator-to-indicator condition, e.g. close below BB_Lower', () => {
    const resolved = resolveRuleStrategyParams({
      source: 'manual',
      indicators: [{ name: 'BollingerBands' }],
      conditions: {
        long: [{ indicator: 'Close', operator: '<', indicatorRef: 'BB_Lower' }],
        short: [],
      },
      timeframe: '1m',
    });
    expect(resolved.conditions.long).toEqual([
      { indicator: 'Close', operator: '<', indicatorRef: 'BB_Lower' },
    ]);
  });

  it('rejects a condition setting neither value nor indicatorRef', () => {
    expect(() =>
      resolveRuleStrategyParams({
        ...BASE,
        conditions: { long: [{ indicator: 'RSI', operator: '<' }], short: [] },
      }),
    ).toThrow(/exactly one of "value" or "indicatorRef"/i);
  });

  it('rejects a condition setting both value and indicatorRef', () => {
    expect(() =>
      resolveRuleStrategyParams({
        ...BASE,
        conditions: {
          long: [
            { indicator: 'RSI', operator: '<', value: 30, indicatorRef: 'RSI' },
          ],
          short: [],
        },
      }),
    ).toThrow(/exactly one of "value" or "indicatorRef"/i);
  });

  it('rejects a condition referencing an undeclared indicator', () => {
    expect(() =>
      resolveRuleStrategyParams({
        ...BASE,
        conditions: {
          long: [{ indicator: 'MACD_LINE', operator: '<', value: 30 }],
          short: [],
        },
      }),
    ).toThrow(/unknown indicator "MACD_LINE"/i);
  });

  it('rejects a nested AND/OR node in place of a flat condition, via strict unknown-key validation', () => {
    expect(() =>
      resolveRuleStrategyParams({
        ...BASE,
        conditions: {
          long: [
            {
              operator: 'AND',
              clauses: [{ indicator: 'RSI', operator: '<', value: 30 }],
            },
          ],
          short: [],
        },
      }),
    ).toThrow(/unexpected key "clauses"/i);
  });

  it('rejects a nested AND/OR tree in place of the flat direction list', () => {
    expect(() =>
      resolveRuleStrategyParams({
        ...BASE,
        conditions: {
          long: { operator: 'AND', clauses: [] },
          short: [],
        },
      }),
    ).toThrow(/must be an array/i);
  });

  it('rejects both directions empty', () => {
    expect(() =>
      resolveRuleStrategyParams({
        ...BASE,
        conditions: { long: [], short: [] },
      }),
    ).toThrow(/at least one condition/i);
  });

  it('allows a long-only strategy with an empty short list', () => {
    const resolved = resolveRuleStrategyParams({
      ...BASE,
      conditions: {
        long: [{ indicator: 'RSI', operator: '<', value: 30 }],
        short: [],
      },
    });
    expect(resolved.conditions.short).toEqual([]);
  });
});

describe('resolveRuleStrategyParams: top-level strictness', () => {
  it('rejects a stray top-level key', () => {
    expect(() =>
      resolveRuleStrategyParams({
        source: 'manual',
        indicators: [],
        conditions: {
          long: [{ indicator: 'Close', operator: '>', value: 1 }],
          short: [],
        },
        timeframe: '1m',
        position: 'top',
      }),
    ).toThrow(/unexpected key "position"/i);
  });

  it('rejects a missing timeframe', () => {
    expect(() =>
      resolveRuleStrategyParams({
        source: 'manual',
        indicators: [],
        conditions: {
          long: [{ indicator: 'Close', operator: '>', value: 1 }],
          short: [],
        },
      }),
    ).toThrow(/timeframe must be/i);
  });

  it('rejects an invalid source', () => {
    expect(() =>
      resolveRuleStrategyParams({
        source: 'made-up',
        indicators: [],
        conditions: {
          long: [{ indicator: 'Close', operator: '>', value: 1 }],
          short: [],
        },
        timeframe: '1m',
      }),
    ).toThrow(/source must be/i);
  });
});

describe('resolveRuleStrategyParams: riskManagement', () => {
  const BASE = {
    source: 'manual' as const,
    indicators: [],
    conditions: {
      long: [{ indicator: 'Close' as const, operator: '>' as const, value: 1 }],
      short: [],
    },
    timeframe: '1m' as const,
  };

  it('resolves a percent stopLoss/takeProfit onto flat ratios', () => {
    const resolved = resolveRuleStrategyParams({
      ...BASE,
      riskManagement: {
        stopLoss: { type: 'percent', value: 2 },
        takeProfit: { type: 'percent', value: 5 },
      },
    });
    expect(resolved.stopLoss).toBe(0.02);
    expect(resolved.takeProfit).toBe(0.05);
    expect(resolved.riskManagement).toEqual({
      stopLoss: { type: 'percent', value: 2 },
      takeProfit: { type: 'percent', value: 5 },
    });
  });

  it('rejects a percent value outside (0, 100]', () => {
    expect(() =>
      resolveRuleStrategyParams({
        ...BASE,
        riskManagement: { stopLoss: { type: 'percent', value: 0 } },
      }),
    ).toThrow(/0 < value <= 100/);
    expect(() =>
      resolveRuleStrategyParams({
        ...BASE,
        riskManagement: { stopLoss: { type: 'percent', value: 150 } },
      }),
    ).toThrow(/0 < value <= 100/);
  });

  it('rejects a non-percent type', () => {
    expect(() =>
      resolveRuleStrategyParams({
        ...BASE,
        riskManagement: { stopLoss: { type: 'absolute', value: 2 } },
      }),
    ).toThrow(/must be "percent"/);
  });
});

describe('resolveRuleStrategyParams: applicability', () => {
  const BASE = {
    source: 'manual' as const,
    indicators: [],
    conditions: {
      long: [{ indicator: 'Close' as const, operator: '>' as const, value: 1 }],
      short: [],
    },
    timeframe: '1m' as const,
  };

  it('accepts the USDT_ALL wildcard', () => {
    const resolved = resolveRuleStrategyParams({
      ...BASE,
      applicability: { pairs: 'USDT_ALL' },
    });
    expect(resolved.applicability).toEqual({ pairs: 'USDT_ALL' });
  });

  it('accepts an explicit pair list, uppercased', () => {
    const resolved = resolveRuleStrategyParams({
      ...BASE,
      applicability: { pairs: ['btcusdt'] },
    });
    expect(resolved.applicability).toEqual({ pairs: ['BTCUSDT'] });
  });

  it('rejects an invalid pairs value', () => {
    expect(() =>
      resolveRuleStrategyParams({ ...BASE, applicability: { pairs: 42 } }),
    ).toThrow(/USDT_ALL.*or an array/i);
  });
});

describe('evaluateDirection', () => {
  it('treats an empty condition list as never satisfied, not vacuously true', () => {
    expect(evaluateDirection([], { RSI: 10 })).toBe(false);
  });

  it('combines conditions as a flat AND', () => {
    const conditions = [
      { indicator: 'RSI', operator: '<' as const, value: 30 },
      { indicator: 'Close', operator: '<' as const, indicatorRef: 'BB_Lower' },
    ];
    expect(
      evaluateDirection(conditions, { RSI: 25, Close: 90, BB_Lower: 95 }),
    ).toBe(true);
    expect(
      evaluateDirection(conditions, { RSI: 35, Close: 90, BB_Lower: 95 }),
    ).toBe(false);
  });
});

describe('requiredHistoryForRule', () => {
  it('mirrors the hand-written strategies formulas', () => {
    expect(
      requiredHistoryForRule(
        resolveRuleStrategyParams({
          source: 'manual',
          indicators: [{ name: 'SMA', period: 20 }],
          conditions: {
            long: [{ indicator: 'SMA', operator: '>', value: 1 }],
            short: [],
          },
          timeframe: '1m',
        }),
      ),
    ).toBe(21);
    expect(
      requiredHistoryForRule(
        resolveRuleStrategyParams({
          source: 'manual',
          indicators: [{ name: 'RSI', period: 14 }],
          conditions: {
            long: [{ indicator: 'RSI', operator: '<', value: 30 }],
            short: [],
          },
          timeframe: '1m',
        }),
      ),
    ).toBe(16);
    expect(
      requiredHistoryForRule(
        resolveRuleStrategyParams({
          source: 'manual',
          indicators: [{ name: 'BollingerBands', period: 20 }],
          conditions: {
            long: [
              { indicator: 'Close', operator: '<', indicatorRef: 'BB_Lower' },
            ],
            short: [],
          },
          timeframe: '1m',
        }),
      ),
    ).toBe(21);
  });
});
