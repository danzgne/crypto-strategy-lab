import { describe, expect, it } from 'vitest';

import {
  MA_STRATEGY_ID,
  RSI_STRATEGY_ID,
  BB_STRATEGY_ID,
  SR_STRATEGY_ID,
  SMC_STRATEGY_ID,
  WYCKOFF_STRATEGY_ID,
  StrategyRegistry,
} from '../src/index';

describe('StrategyRegistry', () => {
  it('registers all available strategies by default', () => {
    const list = StrategyRegistry.list();
    expect(list).toContain(MA_STRATEGY_ID);
    expect(list).toContain(RSI_STRATEGY_ID);
    expect(list).toContain(BB_STRATEGY_ID);
    expect(list).toContain(SR_STRATEGY_ID);
    expect(list).toContain(SMC_STRATEGY_ID);
    expect(list).toContain(WYCKOFF_STRATEGY_ID);
  });

  it('instantiates strategies with default parameters', () => {
    const strategies = [
      MA_STRATEGY_ID,
      RSI_STRATEGY_ID,
      BB_STRATEGY_ID,
      SR_STRATEGY_ID,
      SMC_STRATEGY_ID,
      WYCKOFF_STRATEGY_ID,
    ];

    for (const id of strategies) {
      const strategy = StrategyRegistry.create(id, {});
      expect(strategy).toBeDefined();
      expect(strategy.id).toBe(id);
      expect(typeof strategy.analyze).toBe('function');
    }
  });
});
