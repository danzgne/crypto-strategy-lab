import type { Strategy, StrategyFactory } from './types';

export class StrategyRegistry {
  private static readonly factories = new Map<string, StrategyFactory>();
  private static readonly aliases = new Map<string, string>();

  public static register(id: string, factory: StrategyFactory): void {
    if (id.trim().length === 0) {
      throw new Error('Strategy id must not be empty');
    }
    if (this.factories.has(id)) {
      throw new Error(`Strategy ${id} is already registered`);
    }
    if (this.aliases.has(id)) {
      throw new Error(`Strategy ${id} is already registered as an alias`);
    }
    this.factories.set(id, factory);
  }

  public static registerAlias(alias: string, targetId: string): void {
    if (alias.trim().length === 0) {
      throw new Error('Strategy alias must not be empty');
    }
    if (targetId.trim().length === 0) {
      throw new Error('Strategy targetId must not be empty');
    }
    if (alias === targetId) {
      throw new Error(`Cannot register alias "${alias}" targeting itself`);
    }
    if (this.factories.has(alias)) {
      throw new Error(
        `Cannot register alias "${alias}" because it is already registered as a strategy`,
      );
    }
    if (this.aliases.has(alias)) {
      throw new Error(`Strategy alias "${alias}" is already registered`);
    }
    this.aliases.set(alias, targetId);
  }

  public static get(id: string): StrategyFactory | undefined {
    const direct = this.factories.get(id);
    if (direct !== undefined) {
      return direct;
    }
    const targetId = this.aliases.get(id);
    if (targetId !== undefined) {
      return this.factories.get(targetId);
    }
    return undefined;
  }

  public static canonicalId(id: string): string {
    return this.aliases.get(id) ?? id;
  }

  public static has(id: string): boolean {
    return this.factories.has(id) || this.aliases.has(id);
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
