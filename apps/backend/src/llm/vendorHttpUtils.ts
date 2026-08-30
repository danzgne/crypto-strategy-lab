import type { z } from 'zod';

import type {
  LlmJsonGenerateResult,
  LlmJsonSchemaIssue,
} from './llmJsonProvider.interface';

export function isHardFailureHttpStatus(status: number): boolean {
  return status === 429 || status === 424 || status >= 500;
}

async function readResponseBodyText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

export interface VendorRequestConfig<T> {
  readonly vendorName: string;
  readonly generatedBy: string;
  readonly fetchImplementation: typeof globalThis.fetch;
  readonly url: string;
  readonly init: RequestInit;
  readonly schema: z.ZodType<T>;
  readonly extractRawJsonText: (payload: unknown) => string | null;
}

export async function performVendorGenerate<T>(
  config: VendorRequestConfig<T>,
): Promise<LlmJsonGenerateResult<T>> {
  let response: Response;
  try {
    response = await config.fetchImplementation(config.url, config.init);
  } catch {
    return { outcome: 'ALL_PROVIDERS_UNAVAILABLE' };
  }

  if (!response.ok) {
    if (isHardFailureHttpStatus(response.status)) {
      return { outcome: 'ALL_PROVIDERS_UNAVAILABLE' };
    }
    const bodyText = await readResponseBodyText(response);
    throw new Error(
      `${config.vendorName} request failed with HTTP ${response.status}: ${bodyText}`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { outcome: 'ALL_PROVIDERS_UNAVAILABLE' };
  }

  const text = config.extractRawJsonText(payload);
  if (text === null || text.length === 0) {
    return { outcome: 'ALL_PROVIDERS_UNAVAILABLE' };
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { outcome: 'ALL_PROVIDERS_UNAVAILABLE' };
  }

  const parsed = config.schema.safeParse(value);
  if (!parsed.success) {
    const issues: LlmJsonSchemaIssue[] = parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    return { outcome: 'SCHEMA_INVALID', issues };
  }

  return {
    outcome: 'SUCCESS',
    value: parsed.data,
    generatedBy: config.generatedBy,
  };
}
