import type { SearchSpace } from '@crypto-strategy-lab/shared';
import { describe, expect, it } from 'vitest';
import {
  InvalidSearchSpaceError,
  RandomGenerator,
} from '@/api/features/search/generators/randomGenerator';

describe('RandomGenerator', () => {
  const sampleSearchSpace: SearchSpace = {
    enabledStrategies: [
      {
        id: 'ma',
        paramsSchema: {
          properties: {
            fast: { default: 20, maximum: 50, minimum: 5, type: 'integer' },
            slow: { default: 50, maximum: 200, minimum: 51, type: 'integer' },
          },
          type: 'object',
        },
      },
      {
        id: 'rsi',
        paramsSchema: {
          properties: {
            overbought: {
              default: 70,
              maximum: 90,
              minimum: 60,
              type: 'number',
            },
            oversold: { default: 30, maximum: 40, minimum: 10, type: 'number' },
            period: { default: 14, maximum: 30, minimum: 7, type: 'integer' },
          },
          type: 'object',
        },
      },
      {
        id: 'bb',
        paramsSchema: {
          properties: {
            period: { default: 20, maximum: 50, minimum: 10, type: 'integer' },
            stdDev: { default: 2, maximum: 3, minimum: 1, type: 'number' },
          },
          type: 'object',
        },
      },
    ],
    endTime: 1700000000000,
    pair: 'BTCUSDT',
    permittedCombinationModes: ['majority', 'weighted'],
    startTime: 1690000000000,
    timeframe: '1h',
  };

  it('generates reproducible candidates for the same searchSpace, seed, and ordinal', () => {
    const genA = new RandomGenerator(sampleSearchSpace, 12345, 'random-v1');
    const genB = new RandomGenerator(sampleSearchSpace, 12345, 'random-v1');

    const candA = genA.generate();
    const candB = genB.generate();

    expect(candA.fingerprint).toBe(candB.fingerprint);
    expect(candA.strategyIds).toEqual(candB.strategyIds);
    expect(candA.parameterSnapshots).toEqual(candB.parameterSnapshots);
    expect(candA.combinationConfig).toEqual(candB.combinationConfig);
    expect(candA.provenance).toEqual(candB.provenance);
  });

  it('increments generationOrdinal for consecutive candidates', () => {
    const gen = new RandomGenerator(sampleSearchSpace, 42, 'random-v1');

    const c1 = gen.generate();
    const c2 = gen.generate();
    const c3 = gen.generate();

    expect(c1.provenance.generationOrdinal).toBe(1);
    expect(c2.provenance.generationOrdinal).toBe(2);
    expect(c3.provenance.generationOrdinal).toBe(3);
  });

  it('restoring from a persisted ordinal continues the exact same sequence', () => {
    const continuous = new RandomGenerator(
      sampleSearchSpace,
      2024,
      'random-v1',
    );
    continuous.generate();
    continuous.generate();
    const third = continuous.generate();
    const fourth = continuous.generate();

    const restored = new RandomGenerator(
      sampleSearchSpace,
      2024,
      'random-v1',
      3,
    );
    const restoredThird = restored.generate();
    const restoredFourth = restored.generate();

    expect(restoredThird).toEqual(third);
    expect(restoredFourth).toEqual(fourth);
  });

  it('produces a different sequence for a different seed', () => {
    const genA = new RandomGenerator(sampleSearchSpace, 1, 'random-v1');
    const genB = new RandomGenerator(sampleSearchSpace, 2, 'random-v1');

    const candA = genA.generate();
    const candB = genB.generate();

    expect(candA.fingerprint).not.toBe(candB.fingerprint);
  });

  it('samples parameters within specified bounds', () => {
    const gen = new RandomGenerator(sampleSearchSpace, 999);

    for (let i = 0; i < 20; i++) {
      const candidate = gen.generate();
      candidate.strategyIds.forEach((id, idx) => {
        const params = candidate.parameterSnapshots[idx] as Record<
          string,
          number
        >;
        if (id === 'ma') {
          if (params.fast !== undefined) {
            expect(params.fast).toBeGreaterThanOrEqual(5);
            expect(params.fast).toBeLessThanOrEqual(50);
          }
          if (params.slow !== undefined) {
            expect(params.slow).toBeGreaterThanOrEqual(51);
            expect(params.slow).toBeLessThanOrEqual(200);
          }
        } else if (id === 'rsi') {
          if (params.period !== undefined) {
            expect(params.period).toBeGreaterThanOrEqual(7);
            expect(params.period).toBeLessThanOrEqual(30);
          }
        }
      });
    }
  });

  it('does not select duplicate strategies in a single candidate', () => {
    const gen = new RandomGenerator(sampleSearchSpace, 555);

    for (let i = 0; i < 20; i++) {
      const candidate = gen.generate();
      const uniqueIds = new Set(candidate.strategyIds);
      expect(uniqueIds.size).toBe(candidate.strategyIds.length);
    }
  });

  it('configures combination only when subset size >= 2', () => {
    const gen = new RandomGenerator(sampleSearchSpace, 777);

    for (let i = 0; i < 20; i++) {
      const candidate = gen.generate();
      if (candidate.strategyIds.length === 1) {
        expect(candidate.combinationConfig).toBeUndefined();
      } else {
        expect(candidate.combinationConfig).toBeDefined();
        expect(['majority', 'weighted']).toContain(
          candidate.combinationConfig?.mode,
        );
        if (candidate.combinationConfig?.mode === 'weighted') {
          expect(candidate.combinationConfig.weights?.length).toBe(
            candidate.strategyIds.length,
          );
        }
      }
    }
  });

  it('throws InvalidSearchSpaceError for empty strategy list', () => {
    expect(
      () =>
        new RandomGenerator({ ...sampleSearchSpace, enabledStrategies: [] }, 1),
    ).toThrow(InvalidSearchSpaceError);
  });

  it('throws InvalidSearchSpaceError when minimum exceeds maximum in parameter domain', () => {
    const invalidSpace: SearchSpace = {
      ...sampleSearchSpace,
      enabledStrategies: [
        {
          id: 'bad',
          paramDomains: {
            paramX: { maximum: 10, minimum: 100, type: 'integer' },
          },
        },
      ],
    };

    expect(() => new RandomGenerator(invalidSpace, 1)).toThrow(
      InvalidSearchSpaceError,
    );
  });
});
