import type { RuleStrategyParams } from '@crypto-strategy-lab/shared';
import { RuleStrategy } from '@crypto-strategy-lab/strategy-engine';

import type { LlmJsonProvider } from '@/llm/llmJsonProvider.interface';
import type { AppLogger } from '@/utils/logger';
import { createAppLogger } from '@/utils/logger';

import { extractTextFromUrl as extractTextFromUrlDefault } from './linkExtractor';
import { normalizeGeneratedStrategy } from './normalizeGeneratedStrategy';
import {
  buildGenerationPrompt,
  STRATEGY_GENERATION_CONSUMER_ID,
} from './prompt';
import { STRATEGY_GENERATION_WIRE_SCHEMA } from './wireSchema';

export interface GenerateStrategyInput {
  readonly kind: 'USER_PROMPT' | 'WEB_IMPORT';
  readonly input: string;
}

export type GenerateStrategyResult =
  | {
      readonly outcome: 'SUCCESS';
      readonly name: string;
      readonly description: string;
      readonly tags: string[];
      readonly params: RuleStrategyParams;
      readonly unsupportedRequests: string[];
      readonly generatedBy: string;
    }
  | { readonly outcome: 'EXTRACTION_FAILED'; readonly message: string }
  | { readonly outcome: 'GENERATION_INVALID'; readonly message: string }
  | { readonly outcome: 'LLM_UNAVAILABLE' };

export interface StrategyGenerationServiceDependencies {
  llmProvider: LlmJsonProvider;
  extractTextFromUrl?: (url: string) => Promise<string>;
  logger?: AppLogger;
}

export class StrategyGenerationService {
  private readonly llmProvider: LlmJsonProvider;

  private readonly extractTextFromUrl: (url: string) => Promise<string>;

  private readonly logger: AppLogger;

  public constructor({
    llmProvider,
    extractTextFromUrl = extractTextFromUrlDefault,
    logger = createAppLogger({
      service: 'strategy-generation-service',
      enabled: false,
    }),
  }: StrategyGenerationServiceDependencies) {
    this.llmProvider = llmProvider;
    this.extractTextFromUrl = extractTextFromUrl;
    this.logger = logger;
  }

  public async generate(
    input: GenerateStrategyInput,
  ): Promise<GenerateStrategyResult> {
    let content: string;
    if (input.kind === 'WEB_IMPORT') {
      try {
        content = await this.extractTextFromUrl(input.input);
      } catch (error) {
        return {
          outcome: 'EXTRACTION_FAILED',
          message: (error as Error).message,
        };
      }
    } else {
      content = input.input;
    }

    const prompt = buildGenerationPrompt(input.kind, content);
    const result = await this.llmProvider.generate({
      consumerId: STRATEGY_GENERATION_CONSUMER_ID,
      prompt,
      schema: STRATEGY_GENERATION_WIRE_SCHEMA,
    });

    if (result.outcome === 'ALL_PROVIDERS_UNAVAILABLE') {
      return { outcome: 'LLM_UNAVAILABLE' };
    }

    if (result.outcome === 'SCHEMA_INVALID') {
      this.logger.warn(
        { issuePaths: result.issues.map((issue) => issue.path) },
        'Strategy generation produced a schema-invalid response',
      );
      return {
        outcome: 'GENERATION_INVALID',
        message:
          'The generated strategy did not match the expected shape. Try rephrasing the description.',
      };
    }

    const normalized = normalizeGeneratedStrategy(result.value);

    try {
      new RuleStrategy(normalized.params);
    } catch (error) {
      return {
        outcome: 'GENERATION_INVALID',
        message: (error as Error).message,
      };
    }

    return {
      outcome: 'SUCCESS',
      name: normalized.name,
      description: normalized.description,
      tags: normalized.tags,
      params: normalized.params,
      unsupportedRequests: normalized.unsupportedRequests,
      generatedBy: result.generatedBy,
    };
  }
}
