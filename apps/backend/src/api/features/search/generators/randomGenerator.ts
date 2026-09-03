import type {
  CandidateStrategy,
  CombinationConfig,
  EnabledStrategyDescriptor,
  RandomSource,
  SearchSpace,
  StrategyGenerator,
  StrategySearchParamDomain,
} from '@crypto-strategy-lab/shared';
import {
  isVersionMember,
  RANDOM_SEARCH_ALGORITHM_ID,
} from '@crypto-strategy-lab/shared';
import { computeCandidateFingerprint } from '../services/fingerprint';
import { deriveOrdinalSeed, SeededRandomSource } from './randomSource';
import { StrategyGeneratorRegistry } from './registry';

export const RANDOM_GENERATOR_ID = RANDOM_SEARCH_ALGORITHM_ID;

export class InvalidSearchSpaceError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'InvalidSearchSpaceError';
  }
}

// Each generate() derives its own RNG stream from (seed, ordinal), so restoring at any startOrdinal reproduces the rest of the sequence without replaying prior ordinals.
export class RandomGenerator implements StrategyGenerator {
  private nextOrdinal: number;

  public constructor(
    private readonly searchSpace: SearchSpace,
    private readonly seed: number,
    private readonly algorithmName: string = RANDOM_GENERATOR_ID,
    startOrdinal = 1,
  ) {
    this.validateSearchSpace(searchSpace);
    this.nextOrdinal = startOrdinal;
  }

  public generate(): CandidateStrategy {
    const ordinal = this.nextOrdinal++;
    const randomSource: RandomSource = new SeededRandomSource(
      deriveOrdinalSeed(this.seed, ordinal),
    );

    const enabled = this.searchSpace.enabledStrategies;
    const n = enabled.length;
    const subsetSize = 1 + Math.floor(randomSource.random() * n);

    const selectedStrategies = this.sampleWithoutReplacement(
      enabled,
      subsetSize,
      randomSource,
    );
    const strategyIds = selectedStrategies.map((strategy) => strategy.id);
    const parameterSnapshots = selectedStrategies.map((strategy) =>
      this.sampleParameters(strategy, randomSource),
    );
    const memberSources = selectedStrategies.map((strategy) =>
      isVersionMember(strategy)
        ? {
            displayName: strategy.displayName,
            strategyVersionId: strategy.strategyVersionId,
            versionTag: strategy.versionTag,
          }
        : undefined,
    );
    const hasMemberSource = memberSources.some(
      (source) => source !== undefined,
    );

    let combinationConfig: CombinationConfig | undefined;
    if (subsetSize >= 2) {
      combinationConfig = this.sampleCombinationConfig(
        subsetSize,
        randomSource,
      );
    }

    const fingerprint = computeCandidateFingerprint(
      strategyIds,
      parameterSnapshots,
      combinationConfig,
    );

    const provenance = {
      algorithm: this.algorithmName,
      generationOrdinal: ordinal,
      seed: this.seed,
    };

    return Object.freeze({
      combinationConfig,
      fingerprint,
      ...(hasMemberSource
        ? {
            memberSources: Object.freeze(
              memberSources.map((source) =>
                source ? Object.freeze({ ...source }) : undefined,
              ),
            ),
          }
        : {}),
      parameterSnapshots: parameterSnapshots.map((snapshot) =>
        Object.freeze({ ...snapshot }),
      ),
      provenance: Object.freeze(provenance),
      strategyIds: Object.freeze([...strategyIds]),
    });
  }

  private validateSearchSpace(space: SearchSpace): void {
    if (!space.enabledStrategies || space.enabledStrategies.length === 0) {
      throw new InvalidSearchSpaceError(
        'Search space must contain at least one enabled strategy',
      );
    }

    for (const descriptor of space.enabledStrategies) {
      if (isVersionMember(descriptor)) {
        continue; // fixed params, nothing to validate a domain against
      }
      if (descriptor.paramDomains) {
        for (const [paramName, domain] of Object.entries(
          descriptor.paramDomains,
        )) {
          this.validateDomain(descriptor.id, paramName, domain);
        }
      }
      if (descriptor.paramsSchema?.properties) {
        for (const [paramName, prop] of Object.entries(
          descriptor.paramsSchema.properties,
        )) {
          if (
            prop.minimum !== undefined &&
            prop.maximum !== undefined &&
            prop.minimum > prop.maximum
          ) {
            throw new InvalidSearchSpaceError(
              `Invalid parameter domain for ${descriptor.id}.${paramName}: minimum (${prop.minimum}) cannot exceed maximum (${prop.maximum})`,
            );
          }
        }
      }
    }
  }

  private validateDomain(
    strategyId: string,
    paramName: string,
    domain: StrategySearchParamDomain,
  ): void {
    if (
      domain.minimum !== undefined &&
      domain.maximum !== undefined &&
      domain.minimum > domain.maximum
    ) {
      throw new InvalidSearchSpaceError(
        `Invalid parameter domain for ${strategyId}.${paramName}: minimum (${domain.minimum}) cannot exceed maximum (${domain.maximum})`,
      );
    }
    if (domain.step !== undefined && domain.step <= 0) {
      throw new InvalidSearchSpaceError(
        `Invalid parameter domain for ${strategyId}.${paramName}: step must be positive, got ${domain.step}`,
      );
    }
  }

  private sampleWithoutReplacement<T>(
    items: readonly T[],
    count: number,
    randomSource: RandomSource,
  ): T[] {
    const copy = [...items];
    const result: T[] = [];
    for (let i = 0; i < count && copy.length > 0; i++) {
      const index = Math.floor(randomSource.random() * copy.length);
      const [item] = copy.splice(index, 1);
      if (item !== undefined) {
        result.push(item);
      }
    }
    return result;
  }

  private sampleParameters(
    descriptor: EnabledStrategyDescriptor,
    randomSource: RandomSource,
  ): Record<string, unknown> {
    if (isVersionMember(descriptor)) {
      // Fixed by definition (see ADR-0028): a version member's params are never sampled.
      return { ...descriptor.params };
    }

    const params: Record<string, unknown> = {};
    const domains = descriptor.paramDomains ?? {};
    const schemaProps = descriptor.paramsSchema?.properties ?? {};

    const allKeys = new Set([
      ...Object.keys(domains),
      ...Object.keys(schemaProps),
    ]);

    for (const key of allKeys) {
      const domain = domains[key];
      const schemaProp = schemaProps[key];

      if (domain) {
        params[key] = this.sampleFromDomain(domain, randomSource);
      } else if (schemaProp) {
        if (
          schemaProp.minimum !== undefined &&
          schemaProp.maximum !== undefined
        ) {
          const isInt = schemaProp.type === 'integer';
          const min = schemaProp.minimum;
          const max = schemaProp.maximum;
          if (isInt) {
            params[key] =
              min + Math.floor(randomSource.random() * (max - min + 1));
          } else {
            params[key] = min + randomSource.random() * (max - min);
          }
        } else if (schemaProp.default !== undefined) {
          params[key] = schemaProp.default;
        }
      }
    }

    return params;
  }

  private sampleFromDomain(
    domain: StrategySearchParamDomain,
    randomSource: RandomSource,
  ): unknown {
    if (domain.options && domain.options.length > 0) {
      const idx = Math.floor(randomSource.random() * domain.options.length);
      return domain.options[idx];
    }

    const min = domain.minimum;
    const max = domain.maximum;

    if (min !== undefined && max !== undefined) {
      const step = domain.step;
      const isInteger = domain.type === 'integer';

      if (step !== undefined && step > 0) {
        const numSteps = Math.floor((max - min) / step);
        const chosenStep = Math.floor(randomSource.random() * (numSteps + 1));
        const val = min + chosenStep * step;
        return isInteger ? Math.round(val) : Number(val.toFixed(6));
      }

      if (isInteger) {
        return min + Math.floor(randomSource.random() * (max - min + 1));
      }

      const val = min + randomSource.random() * (max - min);
      return Number(val.toFixed(6));
    }

    if (domain.default !== undefined) {
      return domain.default;
    }

    if (domain.type === 'boolean') {
      return randomSource.random() < 0.5;
    }

    return undefined;
  }

  private sampleCombinationConfig(
    subsetSize: number,
    randomSource: RandomSource,
  ): CombinationConfig {
    const modes = this.searchSpace.permittedCombinationModes;
    const permitted =
      modes.length > 0 ? modes : (['majority', 'weighted'] as const);
    const modeIndex = Math.floor(randomSource.random() * permitted.length);
    const mode = permitted[modeIndex] ?? 'majority';

    if (mode === 'weighted') {
      const rawWeights: number[] = [];
      let total = 0;
      for (let i = 0; i < subsetSize; i++) {
        const w = 0.1 + randomSource.random() * 0.9;
        rawWeights.push(w);
        total += w;
      }
      const normalizedWeights = rawWeights.map((w) =>
        Number((w / total).toFixed(4)),
      );
      const threshold = Number((0.1 + randomSource.random() * 0.8).toFixed(2));
      return {
        mode: 'weighted',
        threshold,
        weights: normalizedWeights,
      };
    }

    return {
      mode: 'majority',
    };
  }
}

StrategyGeneratorRegistry.register(
  RANDOM_GENERATOR_ID,
  (searchSpace, seed, startOrdinal) =>
    new RandomGenerator(searchSpace, seed, RANDOM_GENERATOR_ID, startOrdinal),
);
