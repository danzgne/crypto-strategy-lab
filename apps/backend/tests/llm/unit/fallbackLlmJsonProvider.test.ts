import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { FallbackLlmJsonProvider } from '../../../src/llm/fallbackLlmJsonProvider';
import { GeminiJsonProvider } from '../../../src/llm/geminiJsonProvider';
import { GroqJsonProvider } from '../../../src/llm/groqJsonProvider';
import type {
  LlmJsonGenerateInput,
  LlmJsonGenerateResult,
  LlmJsonProvider,
} from '../../../src/llm/llmJsonProvider.interface';

const schema = z.object({ action: z.enum(['BUY', 'SELL', 'HOLD']) });

function fakeProvider(
  name: string,
  generate: (
    input: LlmJsonGenerateInput<unknown>,
  ) => Promise<LlmJsonGenerateResult<unknown>>,
): LlmJsonProvider {
  return { name, generate: vi.fn(generate) as LlmJsonProvider['generate'] };
}

function succeedsWith(name: string): LlmJsonProvider {
  return fakeProvider(name, async () => ({
    outcome: 'SUCCESS',
    value: { action: 'BUY' },
    generatedBy: name,
  }));
}

function hardFails(name: string): LlmJsonProvider {
  return fakeProvider(name, async () => ({
    outcome: 'ALL_PROVIDERS_UNAVAILABLE',
  }));
}

function schemaInvalid(name: string): LlmJsonProvider {
  return fakeProvider(name, async () => ({
    outcome: 'SCHEMA_INVALID',
    issues: [{ path: 'action', message: 'invalid enum value' }],
  }));
}

function clock(startAt = 0) {
  let current = startAt;
  return {
    now: () => current,
    advanceBy: (ms: number) => {
      current += ms;
    },
  };
}

describe('FallbackLlmJsonProvider', () => {
  it('returns the primary provider result on success without calling the next provider', async () => {
    const primary = succeedsWith('primary');
    const secondary = hardFails('secondary');
    const chain = new FallbackLlmJsonProvider({
      providers: [primary, secondary],
    });

    const result = await chain.generate({
      consumerId: 'strategy-generation',
      prompt: 'p',
      schema,
    });

    expect(result).toEqual({
      outcome: 'SUCCESS',
      value: { action: 'BUY' },
      generatedBy: 'primary',
    });
    expect(secondary.generate).not.toHaveBeenCalled();
  });

  it('falls through to the next provider on a hard failure', async () => {
    const primary = hardFails('primary');
    const secondary = succeedsWith('secondary');
    const chain = new FallbackLlmJsonProvider({
      providers: [primary, secondary],
    });

    const result = await chain.generate({
      consumerId: 'strategy-generation',
      prompt: 'p',
      schema,
    });

    expect(result).toEqual({
      outcome: 'SUCCESS',
      value: { action: 'BUY' },
      generatedBy: 'secondary',
    });
    expect(primary.generate).toHaveBeenCalledTimes(1);
  });

  it('returns SCHEMA_INVALID from the primary without trying the next provider', async () => {
    const primary = schemaInvalid('primary');
    const secondary = succeedsWith('secondary');
    const chain = new FallbackLlmJsonProvider({
      providers: [primary, secondary],
    });

    const result = await chain.generate({
      consumerId: 'strategy-generation',
      prompt: 'p',
      schema,
    });

    expect(result.outcome).toBe('SCHEMA_INVALID');
    expect(secondary.generate).not.toHaveBeenCalled();
  });

  it('does not put a schema-invalid provider on cooldown', async () => {
    const primary = schemaInvalid('primary');
    const secondary = succeedsWith('secondary');
    const chain = new FallbackLlmJsonProvider({
      providers: [primary, secondary],
    });

    await chain.generate({ consumerId: 'c', prompt: 'p', schema });

    expect(chain.getAvailability('c')).toEqual([
      { provider: 'primary', available: true },
      { provider: 'secondary', available: true },
    ]);
  });

  it('returns ALL_PROVIDERS_UNAVAILABLE and cools down every provider when all hard-fail', async () => {
    const primary = hardFails('primary');
    const secondary = hardFails('secondary');
    const { now } = clock(1_000);
    const chain = new FallbackLlmJsonProvider({
      providers: [primary, secondary],
      now,
    });

    const result = await chain.generate({
      consumerId: 'c',
      prompt: 'p',
      schema,
    });

    expect(result).toEqual({ outcome: 'ALL_PROVIDERS_UNAVAILABLE' });
    expect(chain.getAvailability('c')).toEqual([
      {
        provider: 'primary',
        available: false,
        cooldownUntil: 1_000 + 5 * 60_000,
      },
      {
        provider: 'secondary',
        available: false,
        cooldownUntil: 1_000 + 5 * 60_000,
      },
    ]);
  });

  it('skips a cooling-down provider on the next call without invoking it, and lifts the cooldown on expiry', async () => {
    const primary = hardFails('primary');
    const secondary = succeedsWith('secondary');
    const { now, advanceBy } = clock();
    const chain = new FallbackLlmJsonProvider({
      providers: [primary, secondary],
      cooldownMs: 60_000,
      now,
    });

    await chain.generate({ consumerId: 'c', prompt: 'p', schema });
    expect(primary.generate).toHaveBeenCalledTimes(1);

    advanceBy(30_000);
    await chain.generate({ consumerId: 'c', prompt: 'p', schema });
    expect(primary.generate).toHaveBeenCalledTimes(1);

    advanceBy(30_001);
    await chain.generate({ consumerId: 'c', prompt: 'p', schema });
    expect(primary.generate).toHaveBeenCalledTimes(2);
  });

  it('isolates cooldown across three different consumer identifiers on the same provider', async () => {
    const primary = hardFails('primary');
    const secondary = succeedsWith('secondary');
    const chain = new FallbackLlmJsonProvider({
      providers: [primary, secondary],
    });

    await chain.generate({
      consumerId: 'strategy-generation',
      prompt: 'p',
      schema,
    });

    expect(chain.getAvailability('strategy-generation')).toEqual([
      {
        provider: 'primary',
        available: false,
        cooldownUntil: expect.any(Number),
      },
      { provider: 'secondary', available: true },
    ]);
    expect(chain.getAvailability('sentiment')).toEqual([
      { provider: 'primary', available: true },
      { provider: 'secondary', available: true },
    ]);
    expect(chain.getAvailability('extraction')).toEqual([
      { provider: 'primary', available: true },
      { provider: 'secondary', available: true },
    ]);

    await chain.generate({ consumerId: 'sentiment', prompt: 'p', schema });
    expect(primary.generate).toHaveBeenCalledTimes(2);
    await chain.generate({ consumerId: 'extraction', prompt: 'p', schema });
    expect(primary.generate).toHaveBeenCalledTimes(3);
  });

  it('skips a provider with no configured key without a network call, and reports ALL_PROVIDERS_UNAVAILABLE when every provider is unconfigured', async () => {
    const geminiFetchMock = vi.fn();
    const unconfiguredGemini = new GeminiJsonProvider({
      fetch: geminiFetchMock,
    });
    const groqFetchMock = vi.fn();
    const unconfiguredGroq = new GroqJsonProvider({ fetch: groqFetchMock });
    const chain = new FallbackLlmJsonProvider({
      providers: [unconfiguredGemini, unconfiguredGroq],
    });

    const result = await chain.generate({
      consumerId: 'c',
      prompt: 'p',
      schema,
    });

    expect(result).toEqual({ outcome: 'ALL_PROVIDERS_UNAVAILABLE' });
    expect(geminiFetchMock).not.toHaveBeenCalled();
    expect(groqFetchMock).not.toHaveBeenCalled();
  });

  it('composes two chains with opposite provider order over the same vendor instances', async () => {
    const groqLike = succeedsWith('groq');
    const geminiLike = succeedsWith('gemini');

    const strategyChain = new FallbackLlmJsonProvider({
      providers: [groqLike, geminiLike],
    });
    const sentimentChain = new FallbackLlmJsonProvider({
      providers: [geminiLike, groqLike],
    });

    const strategyResult = await strategyChain.generate({
      consumerId: 'strategy-generation',
      prompt: 'p',
      schema,
    });
    const sentimentResult = await sentimentChain.generate({
      consumerId: 'sentiment',
      prompt: 'p',
      schema,
    });

    expect(strategyResult).toMatchObject({ generatedBy: 'groq' });
    expect(sentimentResult).toMatchObject({ generatedBy: 'gemini' });
  });
});
