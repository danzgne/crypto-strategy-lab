import type { Strategy, StrategyFactory } from './types';

export class StrategyRegistry {
  private static readonly factories = new Map<string, StrategyFactory>();

  public static register(id: string, factory: StrategyFactory): void {
    if (id.trim().length === 0) {
      throw new Error('Strategy id must not be empty');
    }
    if (this.factories.has(id)) {
      throw new Error(`Strategy ${id} is already registered`);
    }
    this.factories.set(id, factory);
  }

  public static get(id: string): StrategyFactory | undefined {
    return this.factories.get(id);
  }

  public static create(id: string, params?: unknown): Strategy {
    const factory = this.get(id);
    if (factory === undefined) {
      throw new Error(`Strategy ${id} is not registered`);
    }
    return factory(params);
  }

  public static list(): string[] {
    return [...this.factories.keys()];
  }
}
