import { describe, expect, it } from 'vitest';

import {
  MA_STRATEGY_ID,
  RSI_STRATEGY_ID,
  BB_STRATEGY_ID,
  BOLLINGER_STRATEGY_ID,
  SR_STRATEGY_ID,
  SUPPORT_RESISTANCE_STRATEGY_ID,
  SMC_STRATEGY_ID,
  WYCKOFF_STRATEGY_ID,
  StrategyRegistry,
} from '../src/index';

describe('StrategyRegistry', () => {
  it('registers all canonical strategies by default and excludes aliases from list()', () => {
    const list = StrategyRegistry.list();
    expect(list).toContain(MA_STRATEGY_ID);
    expect(list).toContain(RSI_STRATEGY_ID);
    expect(list).toContain(BB_STRATEGY_ID);
    expect(list).toContain(SR_STRATEGY_ID);
    expect(list).toContain(SMC_STRATEGY_ID);
    expect(list).toContain(WYCKOFF_STRATEGY_ID);

    // Aliases should NOT appear in list() to avoid duplicate search candidates
    expect(list).not.toContain(BOLLINGER_STRATEGY_ID);
    expect(list).not.toContain(SUPPORT_RESISTANCE_STRATEGY_ID);
  });

  it('resolves aliases correctly via has(), canonicalId(), get(), and create()', () => {
    expect(StrategyRegistry.has(BOLLINGER_STRATEGY_ID)).toBe(true);
    expect(StrategyRegistry.has(SUPPORT_RESISTANCE_STRATEGY_ID)).toBe(true);

    expect(StrategyRegistry.canonicalId(BOLLINGER_STRATEGY_ID)).toBe(
      BB_STRATEGY_ID,
    );
    expect(StrategyRegistry.canonicalId(SUPPORT_RESISTANCE_STRATEGY_ID)).toBe(
      SR_STRATEGY_ID,
    );

    const bollingerFactory = StrategyRegistry.get(BOLLINGER_STRATEGY_ID);
    expect(bollingerFactory).toBeDefined();

    const bollingerStrategy = StrategyRegistry.create(
      BOLLINGER_STRATEGY_ID,
      {},
    );
    expect(bollingerStrategy).toBeDefined();
    expect(bollingerStrategy.id).toBe(BB_STRATEGY_ID);

    const srStrategy = StrategyRegistry.create(
      SUPPORT_RESISTANCE_STRATEGY_ID,
      {},
    );
    expect(srStrategy).toBeDefined();
    expect(srStrategy.id).toBe(SR_STRATEGY_ID);
  });

  it('instantiates canonical strategies with default parameters', () => {
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

  it('throws when registering invalid aliases', () => {
    expect(() => StrategyRegistry.registerAlias('', 'ma')).toThrow();
    expect(() => StrategyRegistry.registerAlias('ma_alias', '')).toThrow();
    expect(() => StrategyRegistry.registerAlias('ma', 'ma')).toThrow();
    expect(() =>
      StrategyRegistry.registerAlias(BOLLINGER_STRATEGY_ID, 'bb'),
    ).toThrow();
  });
});
