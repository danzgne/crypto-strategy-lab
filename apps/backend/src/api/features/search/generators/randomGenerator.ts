import type {
  CandidateStrategy,
  CombinationConfig,
  EnabledStrategyDescriptor,
  RandomSource,
  SearchSpace,
  StrategyGenerator,
  StrategySearchParamDomain,
} from '@crypto-strategy-lab/shared';
import { computeCandidateFingerprint } from '../services/fingerprint';

export class InvalidSearchSpaceError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'InvalidSearchSpaceError';
  }
}

export class RandomGenerator implements StrategyGenerator {
  private generationOrdinal = 1;

  public constructor(
    private readonly searchSpace: SearchSpace,
    private readonly randomSource: RandomSource,
    private readonly algorithmName: string = 'random',
    private readonly seed?: number,
  ) {
    this.validateSearchSpace(searchSpace);
  }

  public generate(): CandidateStrategy {
    const enabled = this.searchSpace.enabledStrategies;
    const n = enabled.length;
    const subsetSize = 1 + Math.floor(this.randomSource.random() * n);

    const selectedStrategies = this.sampleWithoutReplacement(
      enabled,
      subsetSize,
    );
    const strategyIds = selectedStrategies.map((strategy) => strategy.id);
    const parameterSnapshots = selectedStrategies.map((strategy) =>
      this.sampleParameters(strategy),
    );

    let combinationConfig: CombinationConfig | undefined;
    if (subsetSize >= 2) {
      combinationConfig = this.sampleCombinationConfig(subsetSize);
    }

    const fingerprint = computeCandidateFingerprint(
      strategyIds,
      parameterSnapshots,
      combinationConfig,
    );

    const provenance = {
      algorithm: this.algorithmName,
      generationOrdinal: this.generationOrdinal++,
      ...(this.seed !== undefined ? { seed: this.seed } : {}),
    };

    return Object.freeze({
      combinationConfig,
      fingerprint,
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

  private sampleWithoutReplacement<T>(items: readonly T[], count: number): T[] {
    const copy = [...items];
    const result: T[] = [];
    for (let i = 0; i < count && copy.length > 0; i++) {
      const index = Math.floor(this.randomSource.random() * copy.length);
      const [item] = copy.splice(index, 1);
      if (item !== undefined) {
        result.push(item);
      }
    }
    return result;
  }

  private sampleParameters(
    descriptor: EnabledStrategyDescriptor,
  ): Record<string, unknown> {
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
        params[key] = this.sampleFromDomain(domain);
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
              min + Math.floor(this.randomSource.random() * (max - min + 1));
          } else {
            params[key] = min + this.randomSource.random() * (max - min);
          }
        } else if (schemaProp.default !== undefined) {
          params[key] = schemaProp.default;
        }
      }
    }

    return params;
  }

  private sampleFromDomain(domain: StrategySearchParamDomain): unknown {
    if (domain.options && domain.options.length > 0) {
      const idx = Math.floor(
        this.randomSource.random() * domain.options.length,
      );
      return domain.options[idx];
    }

    const min = domain.minimum;
    const max = domain.maximum;

    if (min !== undefined && max !== undefined) {
      const step = domain.step;
      const isInteger = domain.type === 'integer';

      if (step !== undefined && step > 0) {
        const numSteps = Math.floor((max - min) / step);
        const chosenStep = Math.floor(
          this.randomSource.random() * (numSteps + 1),
        );
        const val = min + chosenStep * step;
        return isInteger ? Math.round(val) : Number(val.toFixed(6));
      }

      if (isInteger) {
        return min + Math.floor(this.randomSource.random() * (max - min + 1));
      }

      const val = min + this.randomSource.random() * (max - min);
      return Number(val.toFixed(6));
    }

    if (domain.default !== undefined) {
      return domain.default;
    }

    if (domain.type === 'boolean') {
      return this.randomSource.random() < 0.5;
    }

    return undefined;
  }

  private sampleCombinationConfig(subsetSize: number): CombinationConfig {
    const modes = this.searchSpace.permittedCombinationModes;
    const permitted =
      modes.length > 0 ? modes : (['majority', 'weighted'] as const);
    const modeIndex = Math.floor(this.randomSource.random() * permitted.length);
    const mode = permitted[modeIndex] ?? 'majority';

    if (mode === 'weighted') {
      const rawWeights: number[] = [];
      let total = 0;
      for (let i = 0; i < subsetSize; i++) {
        const w = 0.1 + this.randomSource.random() * 0.9;
        rawWeights.push(w);
        total += w;
      }
      const normalizedWeights = rawWeights.map((w) =>
        Number((w / total).toFixed(4)),
      );
      const threshold = Number(
        (0.1 + this.randomSource.random() * 0.8).toFixed(2),
      );
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
