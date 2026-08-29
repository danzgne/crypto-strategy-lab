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

const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const DEFAULT_TIMEOUT_MS = 15_000;
const SCHEMA_NAME = 'structured_response';
const SYSTEM_INSTRUCTION =
  'Respond only with JSON that matches the provided schema. Do not include any other text.';

const GROQ_SCHEMA_RULES: VendorSchemaRules = {
  vendor: 'groq',
  stripKeywords: [
    'pattern',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
    'minimum',
    'maximum',
    'multipleOf',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'default',
    'propertyNames',
    'prefixItems',
    'title',
  ],
  allowedFormats: [],
  collapseNullableAnyOf: false,
};

export interface GroqJsonProviderOptions {
  apiKey?: string | undefined;
  fetch?: typeof globalThis.fetch;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  logger?: AppLogger;
}

interface GroqChatCompletionResponse {
  choices?: Array<{
    message?: { content?: unknown };
    finish_reason?: unknown;
  }>;
}

export class GroqJsonProvider implements LlmJsonProvider {
  public readonly name = 'groq';

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
    logger = createAppLogger({ service: 'groq-json-provider', enabled: false }),
  }: GroqJsonProviderOptions = {}) {
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
      GROQ_SCHEMA_RULES,
      this.logger,
    );

    return performVendorGenerate({
      vendorName: 'Groq',
      generatedBy: this.name,
      fetchImplementation: this.fetchImplementation,
      schema: input.schema,
      url: `${this.baseUrl}/chat/completions`,
      init: {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: SYSTEM_INSTRUCTION },
            { role: 'user', content: input.prompt },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: SCHEMA_NAME,
              strict: true,
              schema: vendorSchema,
            },
          },
          stream: false,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      },
      extractRawJsonText: (payload) =>
        extractMessageContent(payload as GroqChatCompletionResponse),
    });
  }
}

function extractMessageContent(
  payload: GroqChatCompletionResponse,
): string | null {
  const choice = payload.choices?.[0];
  if (choice?.finish_reason === 'length') return null;

  const content = choice?.message?.content;
  return typeof content === 'string' ? content : null;
}
