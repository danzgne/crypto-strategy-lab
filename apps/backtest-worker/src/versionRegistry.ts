import { UnsupportedVersionError } from './errors/UnsupportedVersionError';

export type VersionFactory<T> = () => T;

/**
 * Maps a version string to the implementation that executes it. Shared shape
 * behind BacktesterRegistry and EvaluatorRegistry: the worker dispatches
 * strictly by the version persisted on the Experiment, so an unregistered
 * version fails the job instead of silently falling back to whatever
 * implementation happens to be current.
 */
export class VersionRegistry<T> {
  private readonly factories = new Map<string, VersionFactory<T>>();

  public constructor(private readonly kind: string) {}

  public register(version: string, factory: VersionFactory<T>): void {
    if (version.trim().length === 0) {
      throw new Error(`${this.kind} version must not be empty`);
    }
    if (this.factories.has(version)) {
      throw new Error(
        `${this.kind} version "${version}" is already registered`,
      );
    }
    this.factories.set(version, factory);
  }

  public has(version: string): boolean {
    return this.factories.has(version);
  }

  public create(version: string): T {
    const factory = this.factories.get(version);
    if (!factory) {
      throw new UnsupportedVersionError(
        `${this.kind} version "${version}" is not available on this worker`,
      );
    }
    return factory();
  }

  public list(): string[] {
    return [...this.factories.keys()];
  }
}
