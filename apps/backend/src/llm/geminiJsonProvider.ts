import { z } from 'zod';

import type { AppLogger } from '../utils/logger';
import { createAppLogger } from '../utils/logger';

import {
  toVendorJsonSchema,
  type VendorSchemaRules,
} from './jsonSchemaSanitizer';
import type {
  LlmJsonGenerateInput,
  LlmJsonGenerateResult,
  LlmJsonProvider,
} from './llmJsonProvider.interface';
import { performVendorGenerate } from './vendorHttpUtils';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1';
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_TIMEOUT_MS = 15_000;
const SYSTEM_INSTRUCTION =
  'Respond only with JSON that matches the provided schema. Do not include any other text.';

const GEMINI_SCHEMA_RULES: VendorSchemaRules = {
  vendor: 'gemini',
  stripKeywords: [
    'pattern',
    'minLength',
    'maxLength',
    'contentEncoding',
    'contentMediaType',
    'propertyNames',
    'multipleOf',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'default',
  ],
  allowedFormats: ['date-time', 'date', 'time'],
  collapseNullableAnyOf: true,
};

export interface GeminiJsonProviderOptions {
  apiKey?: string | undefined;
  fetch?: typeof globalThis.fetch;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  logger?: AppLogger;
}

interface GeminiInteractionResponse {
  status?: unknown;
  steps?: Array<{
    type?: unknown;
    content?: Array<{ text?: unknown }>;
  }>;
}

export class GeminiJsonProvider implements LlmJsonProvider {
  public readonly name = 'gemini';

  private readonly apiKey: string | undefined;

  private readonly fetchImplementation: typeof globalThis.fetch;

  private readonly baseUrl: string;

  private readonly model: string;

  private readonly timeoutMs: number;

  private readonly logger: AppLogger;

  public constructor({
    apiKey,
    fetch: fetchImplementation = globalThis.fetch.bind(globalThis),
    baseUrl = DEFAULT_BASE_URL,
    model = DEFAULT_MODEL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    logger = createAppLogger({
      service: 'gemini-json-provider',
      enabled: false,
    }),
  }: GeminiJsonProviderOptions = {}) {
    this.apiKey = apiKey;
    this.fetchImplementation = fetchImplementation;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
  }

  public async generate<T>(
    input: LlmJsonGenerateInput<T>,
  ): Promise<LlmJsonGenerateResult<T>> {
    if (this.apiKey === undefined) {
      return { outcome: 'ALL_PROVIDERS_UNAVAILABLE' };
    }

    const vendorSchema = toVendorJsonSchema(
      z.toJSONSchema(input.schema, { io: 'output' }),
      GEMINI_SCHEMA_RULES,
      this.logger,
    );

    return performVendorGenerate({
      vendorName: 'Gemini',
      generatedBy: this.name,
      fetchImplementation: this.fetchImplementation,
      schema: input.schema,
      url: `${this.baseUrl}/interactions`,
      init: {
        method: 'POST',
        headers: {
          'x-goog-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          input: input.prompt,
          system_instruction: SYSTEM_INSTRUCTION,
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema: vendorSchema,
          },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      },
      extractRawJsonText: (payload) =>
        extractModelOutputText(payload as GeminiInteractionResponse),
    });
  }
}

function extractModelOutputText(
  payload: GeminiInteractionResponse,
): string | null {
  if (payload.status !== 'completed') return null;

  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step?.type !== 'model_output') continue;
    const text = step.content?.[0]?.text;
    return typeof text === 'string' ? text : null;
  }
  return null;
}
