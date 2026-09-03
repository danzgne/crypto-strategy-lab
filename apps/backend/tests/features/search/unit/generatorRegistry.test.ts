import { describe, expect, it } from 'vitest';
import {
  RANDOM_GENERATOR_ID,
  RandomGenerator,
} from '@/api/features/search/generators/randomGenerator';
import {
  StrategyGeneratorRegistry,
  UnsupportedAlgorithmError,
} from '@/api/features/search/generators/registry';

import { defaultSearchSpace } from '../../../helpers/searchFixtures';

describe('StrategyGeneratorRegistry', () => {
  it('registers random-v1 as an advertised MVP algorithm', () => {
    expect(StrategyGeneratorRegistry.has(RANDOM_GENERATOR_ID)).toBe(true);
    expect(StrategyGeneratorRegistry.list()).toContain(RANDOM_GENERATOR_ID);
  });

  it('creates a RandomGenerator instance for random-v1', () => {
    const generator = StrategyGeneratorRegistry.create(
      RANDOM_GENERATOR_ID,
      defaultSearchSpace,
      42,
      1,
    );

    expect(generator).toBeInstanceOf(RandomGenerator);
    expect(generator.generate().provenance.algorithm).toBe(RANDOM_GENERATOR_ID);
  });

  it('rejects an unregistered algorithm id explicitly', () => {
    expect(StrategyGeneratorRegistry.has('domain-guided')).toBe(false);
    expect(() =>
      StrategyGeneratorRegistry.create(
        'domain-guided',
        defaultSearchSpace,
        1,
        1,
      ),
    ).toThrow(UnsupportedAlgorithmError);
  });

  it('rejects an unregistered version of a known algorithm family', () => {
    expect(StrategyGeneratorRegistry.has('random-v2')).toBe(false);
    expect(() =>
      StrategyGeneratorRegistry.create('random-v2', defaultSearchSpace, 1, 1),
    ).toThrow(UnsupportedAlgorithmError);
  });
});
