import { describe, expect, it } from 'vitest';

import { computeStrategyVersionTag } from '../src/strategyVersion';

describe('computeStrategyVersionTag', () => {
  it('is stable across key ordering of the resolved params object', () => {
    const left = computeStrategyVersionTag('ma', { fast: 20, slow: 50 });
    const right = computeStrategyVersionTag('ma', { slow: 50, fast: 20 });
    expect(left).toBe(right);
  });

  it('treats an explicit undefined value the same as an absent key', () => {
    const left = computeStrategyVersionTag('ma', { fast: 20, slow: 50 });
    const right = computeStrategyVersionTag('ma', {
      fast: 20,
      slow: 50,
      stopLoss: undefined,
    });
    expect(left).toBe(right);
  });

  it('differs when a param value differs', () => {
    const left = computeStrategyVersionTag('ma', { fast: 20, slow: 50 });
    const right = computeStrategyVersionTag('ma', { fast: 10, slow: 50 });
    expect(left).not.toBe(right);
  });

  it('differs when the strategy id differs but params match', () => {
    const left = computeStrategyVersionTag('ma', { fast: 20 });
    const right = computeStrategyVersionTag('rsi', { fast: 20 });
    expect(left).not.toBe(right);
  });

  it('produces a hex-encoded sha-256 digest', () => {
    const tag = computeStrategyVersionTag('ma', { fast: 20, slow: 50 });
    expect(tag).toMatch(/^[0-9a-f]{64}$/);
  });
});
