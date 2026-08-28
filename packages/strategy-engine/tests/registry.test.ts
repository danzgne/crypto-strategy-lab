import { describe, expect, it } from 'vitest';

import { MA_STRATEGY_ID, MAStrategy, StrategyRegistry } from '../src/index';

describe('StrategyRegistry', () => {
  it('discovers the MA plugin through the explicit strategy barrel', () => {
    expect(StrategyRegistry.list()).toContain(MA_STRATEGY_ID);

    const strategy = StrategyRegistry.create(MA_STRATEGY_ID, {
      fast: 3,
      slow: 5,
    });

    expect(strategy).toBeInstanceOf(MAStrategy);
    expect(strategy.requiredHistory).toBe(6);
  });
});
