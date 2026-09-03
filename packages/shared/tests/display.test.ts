import { describe, expect, it } from 'vitest';

import { formatCompositeStrategyDisplay } from '../src/strategy/display';

describe('formatCompositeStrategyDisplay', () => {
  const compositeParams = {
    members: [
      { params: {}, strategyId: 'rule' },
      { params: {}, strategyId: 'rsi' },
    ],
  };

  it('falls back to the registry-id label when no member labels are given (unchanged behavior)', () => {
    const display = formatCompositeStrategyDisplay(compositeParams);
    expect(display.name).toBe('RULE + RSI');
    expect(display.members).toEqual([
      { label: 'RULE', strategyId: 'rule' },
      { label: 'RSI', strategyId: 'rsi' },
    ]);
  });

  it('prefers a per-member label captured at candidate generation (ADR-0028), aligned by index', () => {
    const display = formatCompositeStrategyDisplay(compositeParams, undefined, [
      'My RSI Fade',
      null,
    ]);
    expect(display.name).toBe('My RSI Fade + RSI');
    expect(display.members).toEqual([
      { label: 'My RSI Fade', strategyId: 'rule' },
      { label: 'RSI', strategyId: 'rsi' },
    ]);
  });
});
