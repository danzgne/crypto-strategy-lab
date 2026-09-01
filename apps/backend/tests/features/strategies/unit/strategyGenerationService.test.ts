import { describe, expect, it, vi } from 'vitest';

import type {
  LlmJsonGenerateInput,
  LlmJsonGenerateResult,
  LlmJsonProvider,
} from '@/llm/llmJsonProvider.interface';
import { StrategyGenerationService } from '@/api/features/strategies/generation/strategyGenerationService';
import type { GenerationWireResponse } from '@/api/features/strategies/generation/wireSchema';

function validWireResponse(
  overrides: Partial<GenerationWireResponse> = {},
): GenerationWireResponse {
  return {
    name: 'RSI_LONG',
    description: 'Long when RSI drops below 30',
    tags: ['rsi'],
    indicators: [{ name: 'RSI', as: null, period: 14 }],
    conditions: {
      long: [
        { indicator: 'RSI', operator: '<', value: 30, indicatorRef: null },
      ],
      short: [],
    },
    riskManagement: null,
    timeframe: '1h',
    applicability: { pairsMode: 'USDT_ALL', customPairs: null },
    unsupportedRequests: [],
    ...overrides,
  };
}

class FakeLlmJsonProvider implements LlmJsonProvider {
  public readonly name = 'fake';

  public lastInput?: LlmJsonGenerateInput<unknown>;

  public constructor(private readonly result: LlmJsonGenerateResult<unknown>) {}

  public async generate<T>(
    input: LlmJsonGenerateInput<T>,
  ): Promise<LlmJsonGenerateResult<T>> {
    this.lastInput = input;
    return this.result as LlmJsonGenerateResult<T>;
  }
}

describe('StrategyGenerationService', () => {
  it('returns SUCCESS with normalized params for a USER_PROMPT input', async () => {
    const provider = new FakeLlmJsonProvider({
      outcome: 'SUCCESS',
      value: validWireResponse(),
      generatedBy: 'groq',
    });
    const service = new StrategyGenerationService({ llmProvider: provider });

    const result = await service.generate({
      kind: 'USER_PROMPT',
      input: 'Long when RSI under 30',
    });

    expect(result).toMatchObject({
      outcome: 'SUCCESS',
      name: 'RSI_LONG',
      generatedBy: 'groq',
      unsupportedRequests: [],
    });
    if (result.outcome !== 'SUCCESS') throw new Error('expected SUCCESS');
    expect(result.params.conditions.long).toEqual([
      { indicator: 'RSI', operator: '<', value: 30 },
    ]);
  });

  it('extracts page text before prompting for a WEB_IMPORT input', async () => {
    const provider = new FakeLlmJsonProvider({
      outcome: 'SUCCESS',
      value: validWireResponse(),
      generatedBy: 'gemini',
    });
    const extractTextFromUrl = vi
      .fn()
      .mockResolvedValue('the extracted article text');
    const service = new StrategyGenerationService({
      llmProvider: provider,
      extractTextFromUrl,
    });

    const result = await service.generate({
      kind: 'WEB_IMPORT',
      input: 'https://example.com/strategy',
    });

    expect(result.outcome).toBe('SUCCESS');
    expect(extractTextFromUrl).toHaveBeenCalledWith(
      'https://example.com/strategy',
    );
    expect(provider.lastInput?.prompt).toContain('the extracted article text');
  });

  it('returns EXTRACTION_FAILED when link extraction throws', async () => {
    const provider = new FakeLlmJsonProvider({
      outcome: 'SUCCESS',
      value: validWireResponse(),
      generatedBy: 'groq',
    });
    const extractTextFromUrl = vi
      .fn()
      .mockRejectedValue(new Error('refused to fetch a private address'));
    const service = new StrategyGenerationService({
      llmProvider: provider,
      extractTextFromUrl,
    });

    const result = await service.generate({
      kind: 'WEB_IMPORT',
      input: 'http://169.254.169.254/',
    });

    expect(result).toMatchObject({
      outcome: 'EXTRACTION_FAILED',
      message: expect.stringContaining('private address'),
    });
  });

  it('returns LLM_UNAVAILABLE when every provider is unavailable', async () => {
    const provider = new FakeLlmJsonProvider({
      outcome: 'ALL_PROVIDERS_UNAVAILABLE',
    });
    const service = new StrategyGenerationService({ llmProvider: provider });

    const result = await service.generate({
      kind: 'USER_PROMPT',
      input: 'anything',
    });

    expect(result).toEqual({ outcome: 'LLM_UNAVAILABLE' });
  });

  it('returns GENERATION_INVALID when the response is schema-invalid', async () => {
    const provider = new FakeLlmJsonProvider({
      outcome: 'SCHEMA_INVALID',
      issues: [{ path: 'indicators', message: 'Required' }],
    });
    const service = new StrategyGenerationService({ llmProvider: provider });

    const result = await service.generate({
      kind: 'USER_PROMPT',
      input: 'anything',
    });

    expect(result.outcome).toBe('GENERATION_INVALID');
  });

  it('returns GENERATION_INVALID when the normalized params fail RuleStrategy validation', async () => {
    const provider = new FakeLlmJsonProvider({
      outcome: 'SUCCESS',
      value: validWireResponse({
        conditions: {
          long: [
            {
              indicator: 'RSI',
              operator: '<',
              value: null,
              indicatorRef: null,
            },
          ],
          short: [],
        },
      }),
      generatedBy: 'groq',
    });
    const service = new StrategyGenerationService({ llmProvider: provider });

    const result = await service.generate({
      kind: 'USER_PROMPT',
      input: 'anything',
    });

    expect(result.outcome).toBe('GENERATION_INVALID');
    if (result.outcome !== 'GENERATION_INVALID') {
      throw new Error('expected GENERATION_INVALID');
    }
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('passes unsupportedRequests through unchanged', async () => {
    const provider = new FakeLlmJsonProvider({
      outcome: 'SUCCESS',
      value: validWireResponse({ unsupportedRequests: ['MACD'] }),
      generatedBy: 'groq',
    });
    const service = new StrategyGenerationService({ llmProvider: provider });

    const result = await service.generate({
      kind: 'USER_PROMPT',
      input: 'MACD crossover strategy',
    });

    expect(result).toMatchObject({ unsupportedRequests: ['MACD'] });
  });

  it('uses the strategy-generation consumer identity for every LLM call', async () => {
    const provider = new FakeLlmJsonProvider({
      outcome: 'SUCCESS',
      value: validWireResponse(),
      generatedBy: 'groq',
    });
    const service = new StrategyGenerationService({ llmProvider: provider });

    await service.generate({ kind: 'USER_PROMPT', input: 'anything' });

    expect(provider.lastInput?.consumerId).toBe('strategy-generation');
  });
});
