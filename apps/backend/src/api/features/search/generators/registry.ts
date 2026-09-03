import type {
  SearchSpace,
  StrategyGenerator,
} from '@crypto-strategy-lab/shared';

export type StrategyGeneratorFactory = (
  searchSpace: SearchSpace,
  seed: number,
  startOrdinal: number,
) => StrategyGenerator;

export class UnsupportedAlgorithmError extends Error {
  public constructor(public readonly algorithm: string) {
    super(`Unsupported search algorithm: ${algorithm}`);
    this.name = 'UnsupportedAlgorithmError';
  }
}

export class StrategyGeneratorRegistry {
  private static readonly factories = new Map<
    string,
    StrategyGeneratorFactory
  >();

  public static register(id: string, factory: StrategyGeneratorFactory): void {
    if (id.trim().length === 0) {
      throw new Error('Generator id must not be empty');
    }
    if (this.factories.has(id)) {
      throw new Error(`Generator ${id} is already registered`);
    }
    this.factories.set(id, factory);
  }

  public static has(id: string): boolean {
    return this.factories.has(id);
  }

  public static create(
    id: string,
    searchSpace: SearchSpace,
    seed: number,
    startOrdinal = 1,
  ): StrategyGenerator {
    const factory = this.factories.get(id);
    if (!factory) {
      throw new UnsupportedAlgorithmError(id);
    }
    return factory(searchSpace, seed, startOrdinal);
  }

  public static list(): string[] {
    return [...this.factories.keys()];
  }
}
