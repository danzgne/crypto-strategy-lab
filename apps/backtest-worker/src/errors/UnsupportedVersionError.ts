import type { JobFailureCategory } from '@crypto-strategy-lab/shared';

/**
 * Raised when an Experiment's recorded Strategy implementation, Simulation Rules,
 * Evaluator, or application build version is not available on this worker. Always
 * permanent: the worker must never silently substitute its current implementation
 * for a recorded version it does not have.
 */
export class UnsupportedVersionError extends Error {
  public readonly failureCategory: JobFailureCategory = 'PERMANENT';

  public constructor(message: string) {
    super(`UNSUPPORTED_VERSION: ${message}`);
    this.name = 'UnsupportedVersionError';
  }
}
