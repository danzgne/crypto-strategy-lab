import { StrategyRegistry } from './registry';

/** Virtual strategy id under which the CombinationEngine's own implementation version is registered. */
export const COMPOSITE_STRATEGY_IMPLEMENTATION_ID = 'composite';

export class UnsupportedStrategyImplementationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'UnsupportedStrategyImplementationError';
  }
}

/**
 * Maps a Strategy plugin's canonical id to the version of the class that implements
 * its signal logic today. Adding a new Strategy self-registers its own version here,
 * next to its `StrategyRegistry.register(...)` call, so this stays a plugin concern.
 */
export class StrategyImplementationRegistry {
  private static readonly versions = new Map<string, string>();

  public static register(id: string, version: string): void {
    if (id.trim().length === 0) {
      throw new Error('Strategy implementation id must not be empty');
    }
    if (version.trim().length === 0) {
      throw new Error('Strategy implementation version must not be empty');
    }
    if (this.versions.has(id)) {
      throw new Error(
        `Strategy implementation version for "${id}" is already registered`,
      );
    }
    this.versions.set(id, version);
  }

  public static has(id: string): boolean {
    return this.versions.has(id);
  }

  public static get(id: string): string | undefined {
    return this.versions.get(id);
  }

  public static list(): string[] {
    return [...this.versions.keys()];
  }
}

/**
 * Computes the exact Strategy implementation version that would execute a candidate
 * with the given strategy id (or `'composite'` plus its member ids) right now. Both the
 * backend, when it stamps this onto a new Experiment, and the Backtest Worker, when it
 * verifies a recorded version is still available, call this same function so neither
 * side can silently drift from the other.
 */
export function resolveStrategyImplementationVersion(
  strategyId: string,
  memberStrategyIds?: readonly string[],
): string {
  if (strategyId === COMPOSITE_STRATEGY_IMPLEMENTATION_ID) {
    if (!memberStrategyIds || memberStrategyIds.length < 2) {
      throw new UnsupportedStrategyImplementationError(
        'A composite Strategy implementation version requires at least two member strategy ids',
      );
    }
    const compositeVersion = StrategyImplementationRegistry.get(
      COMPOSITE_STRATEGY_IMPLEMENTATION_ID,
    );
    if (compositeVersion === undefined) {
      throw new UnsupportedStrategyImplementationError(
        'The composite combination engine implementation is not registered',
      );
    }
    const memberVersions = memberStrategyIds
      .map((id) => {
        const canonicalId = StrategyRegistry.canonicalId(id);
        const version = StrategyImplementationRegistry.get(canonicalId);
        if (version === undefined) {
          throw new UnsupportedStrategyImplementationError(
            `Strategy implementation "${id}" is not registered`,
          );
        }
        return `${canonicalId}=${version}`;
      })
      .sort();
    return `${compositeVersion}[${memberVersions.join(',')}]`;
  }

  const canonicalId = StrategyRegistry.canonicalId(strategyId);
  const version = StrategyImplementationRegistry.get(canonicalId);
  if (version === undefined) {
    throw new UnsupportedStrategyImplementationError(
      `Strategy implementation "${strategyId}" is not registered`,
    );
  }
  return version;
}
