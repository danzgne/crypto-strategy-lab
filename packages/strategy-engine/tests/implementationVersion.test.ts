import { describe, expect, it } from 'vitest';

import {
  BB_STRATEGY_ID,
  BOLLINGER_STRATEGY_ID,
  COMPOSITE_STRATEGY_IMPLEMENTATION_ID,
  MA_STRATEGY_ID,
  resolveStrategyImplementationVersion,
  RSI_STRATEGY_ID,
  StrategyImplementationRegistry,
  UnsupportedStrategyImplementationError,
} from '../src/index';

describe('StrategyImplementationRegistry', () => {
  it('registers every built-in strategy and the composite combination engine', () => {
    expect(StrategyImplementationRegistry.get(MA_STRATEGY_ID)).toBe('ma-v1');
    expect(StrategyImplementationRegistry.get(RSI_STRATEGY_ID)).toBe('rsi-v1');
    expect(StrategyImplementationRegistry.get(BB_STRATEGY_ID)).toBe('bb-v1');
    expect(
      StrategyImplementationRegistry.get(COMPOSITE_STRATEGY_IMPLEMENTATION_ID),
    ).toBe('composite-v1');
    expect(StrategyImplementationRegistry.has('not-a-real-strategy')).toBe(
      false,
    );
  });

  it('rejects a duplicate registration for the same id', () => {
    expect(() =>
      StrategyImplementationRegistry.register(MA_STRATEGY_ID, 'ma-v2'),
    ).toThrow(/already registered/);
  });
});

describe('resolveStrategyImplementationVersion', () => {
  it('resolves a singular strategy version directly', () => {
    expect(resolveStrategyImplementationVersion(MA_STRATEGY_ID)).toBe('ma-v1');
  });

  it('resolves an alias to its canonical strategy version', () => {
    expect(resolveStrategyImplementationVersion(BOLLINGER_STRATEGY_ID)).toBe(
      'bb-v1',
    );
  });

  it('throws for an unregistered strategy id', () => {
    expect(() => resolveStrategyImplementationVersion('made-up')).toThrow(
      UnsupportedStrategyImplementationError,
    );
  });

  it('computes a deterministic composite version independent of member order', () => {
    const forward = resolveStrategyImplementationVersion('composite', [
      MA_STRATEGY_ID,
      RSI_STRATEGY_ID,
    ]);
    const reversed = resolveStrategyImplementationVersion('composite', [
      RSI_STRATEGY_ID,
      MA_STRATEGY_ID,
    ]);
    expect(forward).toBe(reversed);
    expect(forward).toContain('composite-v1');
    expect(forward).toContain('ma-v1');
    expect(forward).toContain('rsi-v1');
  });

  it('throws when a composite member strategy is not registered', () => {
    expect(() =>
      resolveStrategyImplementationVersion('composite', [
        MA_STRATEGY_ID,
        'made-up',
      ]),
    ).toThrow(UnsupportedStrategyImplementationError);
  });

  it('throws when composite is requested with fewer than two members', () => {
    expect(() =>
      resolveStrategyImplementationVersion('composite', [MA_STRATEGY_ID]),
    ).toThrow(UnsupportedStrategyImplementationError);
  });
});
