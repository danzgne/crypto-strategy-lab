import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { GeminiJsonProvider } from '../../../src/llm/geminiJsonProvider';

const schema = z.object({
  action: z.enum(['BUY', 'SELL', 'HOLD']),
  confidence: z.number(),
});

function completedInteraction(value: unknown): unknown {
  return {
    status: 'completed',
    steps: [
      {
        type: 'model_output',
        content: [{ type: 'text', text: JSON.stringify(value) }],
      },
    ],
  };
}

describe('GeminiJsonProvider', () => {
  it('returns SUCCESS with the parsed value and generatedBy on a valid response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        completedInteraction({ action: 'BUY', confidence: 0.9 }),
    });
    const provider = new GeminiJsonProvider({
      apiKey: 'gemini-key',
      fetch: fetchMock,
    });

    const result = await provider.generate({
      consumerId: 'strategy-generation',
      prompt: 'Generate a strategy',
      schema,
    });

    expect(result).toEqual({
      outcome: 'SUCCESS',
      value: { action: 'BUY', confidence: 0.9 },
      generatedBy: 'gemini',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1/interactions',
    );
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(
      'gemini-key',
    );
    const body = JSON.parse(init.body as string) as {
      response_format: { schema: { $schema?: unknown } };
    };
    expect(body.response_format.schema.$schema).toBeUndefined();
  });

  it('returns SCHEMA_INVALID without retrying when the response is well-formed but does not match', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        completedInteraction({ action: 'MAYBE', confidence: 'high' }),
    });
    const provider = new GeminiJsonProvider({
      apiKey: 'gemini-key',
      fetch: fetchMock,
    });

    const result = await provider.generate({
      consumerId: 'strategy-generation',
      prompt: 'Generate a strategy',
      schema,
    });

    expect(result.outcome).toBe('SCHEMA_INVALID');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([500, 503, 429, 424])(
    'treats HTTP %i as a hard failure',
    async (status) => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status,
        text: async () => 'boom',
      });
      const provider = new GeminiJsonProvider({
        apiKey: 'gemini-key',
        fetch: fetchMock,
      });

      const result = await provider.generate({
        consumerId: 'c',
        prompt: 'p',
        schema,
      });

      expect(result).toEqual({ outcome: 'ALL_PROVIDERS_UNAVAILABLE' });
    },
  );

  it('throws on a 4xx config error other than 429', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":{"code":"invalid_request"}}',
    });
    const provider = new GeminiJsonProvider({
      apiKey: 'gemini-key',
      fetch: fetchMock,
    });

    await expect(
      provider.generate({ consumerId: 'c', prompt: 'p', schema }),
    ).rejects.toThrow(/HTTP 400/);
  });

  it('treats a network error as a hard failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    const provider = new GeminiJsonProvider({
      apiKey: 'gemini-key',
      fetch: fetchMock,
    });

    const result = await provider.generate({
      consumerId: 'c',
      prompt: 'p',
      schema,
    });

    expect(result).toEqual({ outcome: 'ALL_PROVIDERS_UNAVAILABLE' });
  });

  it('treats an unparseable response as a hard failure, not SCHEMA_INVALID', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'text', text: '{not json' }],
          },
        ],
      }),
    });
    const provider = new GeminiJsonProvider({
      apiKey: 'gemini-key',
      fetch: fetchMock,
    });

    const result = await provider.generate({
      consumerId: 'c',
      prompt: 'p',
      schema,
    });

    expect(result).toEqual({ outcome: 'ALL_PROVIDERS_UNAVAILABLE' });
  });

  it('treats an empty response as a hard failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'completed',
        steps: [
          { type: 'model_output', content: [{ type: 'text', text: '' }] },
        ],
      }),
    });
    const provider = new GeminiJsonProvider({
      apiKey: 'gemini-key',
      fetch: fetchMock,
    });

    const result = await provider.generate({
      consumerId: 'c',
      prompt: 'p',
      schema,
    });

    expect(result).toEqual({ outcome: 'ALL_PROVIDERS_UNAVAILABLE' });
  });

  it('is skipped without a network call when no API key is configured', async () => {
    const fetchMock = vi.fn();
    const provider = new GeminiJsonProvider({ fetch: fetchMock });

    const result = await provider.generate({
      consumerId: 'c',
      prompt: 'p',
      schema,
    });

    expect(result).toEqual({ outcome: 'ALL_PROVIDERS_UNAVAILABLE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
