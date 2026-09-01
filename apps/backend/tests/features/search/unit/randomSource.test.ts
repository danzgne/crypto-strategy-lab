import { describe, expect, it } from 'vitest';

import {
  MathRandomSource,
  SeededRandomSource,
} from '@/api/features/search/generators/randomSource';

describe('RandomSource', () => {
  it('MathRandomSource produces numbers between 0 and 1', () => {
    const source = new MathRandomSource();
    for (let i = 0; i < 50; i++) {
      const val = source.random();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('SeededRandomSource produces deterministic numbers for the same seed', () => {
    const sourceA = new SeededRandomSource(42);
    const sourceB = new SeededRandomSource(42);

    const valuesA = Array.from({ length: 20 }, () => sourceA.random());
    const valuesB = Array.from({ length: 20 }, () => sourceB.random());

    expect(valuesA).toEqual(valuesB);
  });

  it('SeededRandomSource produces different sequences for different seeds', () => {
    const sourceA = new SeededRandomSource(42);
    const sourceB = new SeededRandomSource(99);

    const valuesA = Array.from({ length: 10 }, () => sourceA.random());
    const valuesB = Array.from({ length: 10 }, () => sourceB.random());

    expect(valuesA).not.toEqual(valuesB);
  });
});
