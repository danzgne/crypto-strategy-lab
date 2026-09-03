import type { JobFailureCategory } from '@crypto-strategy-lab/shared';

export class UnsupportedExecutionInputError extends Error {
  public readonly failureCategory: JobFailureCategory = 'PERMANENT';

  public constructor(message: string) {
    super(message);
    this.name = 'UnsupportedExecutionInputError';
  }
}
