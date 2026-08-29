import type { z } from 'zod';

export interface LlmJsonGenerateInput<T> {
  readonly consumerId: string;
  readonly prompt: string;
  readonly schema: z.ZodType<T>;
}

export interface LlmJsonSchemaIssue {
  readonly path: string;
  readonly message: string;
}

export type LlmJsonGenerateResult<T> =
  | {
      readonly outcome: 'SUCCESS';
      readonly value: T;
      readonly generatedBy: string;
    }
  | {
      readonly outcome: 'SCHEMA_INVALID';
      readonly issues: readonly LlmJsonSchemaIssue[];
    }
  | { readonly outcome: 'ALL_PROVIDERS_UNAVAILABLE' };

export interface LlmJsonProvider {
  readonly name: string;
  generate<T>(
    input: LlmJsonGenerateInput<T>,
  ): Promise<LlmJsonGenerateResult<T>>;
}
