import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { GroqJsonProvider } from '../../../src/llm/groqJsonProvider';

const schema = z.object({
  action: z.enum(['BUY', 'SELL', 'HOLD']),
  confidence: z.number(),
});

function chatCompletion(content: string, finishReason = 'stop'): unknown {
  return {
    choices: [{ message: { content }, finish_reason: finishReason }],
  };
}

describe('GroqJsonProvider', () => {
  it('returns SUCCESS with the parsed value and generatedBy on a valid response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        chatCompletion(JSON.stringify({ action: 'SELL', confidence: 0.4 })),
    });
    const provider = new GroqJsonProvider({
      apiKey: 'groq-key',
      fetch: fetchMock,
    });

    const result = await provider.generate({
      consumerId: 'sentiment',
      prompt: 'Score this headline',
      schema,
    });

    expect(result).toEqual({
      outcome: 'SUCCESS',
      value: { action: 'SELL', confidence: 0.4 },
      generatedBy: 'groq',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer groq-key',
    );
    const body = JSON.parse(init.body as string) as {
      response_format: {
        json_schema: { strict: boolean; schema: { $schema?: unknown } };
      };
    };
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.$schema).toBeUndefined();
  });

  it('returns SCHEMA_INVALID without retrying when the response is well-formed but does not match', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        chatCompletion(JSON.stringify({ action: 'MAYBE', confidence: 'high' })),
    });
    const provider = new GroqJsonProvider({
      apiKey: 'groq-key',
      fetch: fetchMock,
    });

    const result = await provider.generate({
      consumerId: 'sentiment',
      prompt: 'p',
      schema,
    });

    expect(result.outcome).toBe('SCHEMA_INVALID');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([500, 502, 429, 424])(
    'treats HTTP %i as a hard failure',
    async (status) => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status,
        text: async () => 'boom',
      });
      const provider = new GroqJsonProvider({
        apiKey: 'groq-key',
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
      status: 401,
      text: async () => '{"error":{"code":"invalid_api_key"}}',
    });
    const provider = new GroqJsonProvider({
      apiKey: 'groq-key',
      fetch: fetchMock,
    });

    await expect(
      provider.generate({ consumerId: 'c', prompt: 'p', schema }),
    ).rejects.toThrow(/HTTP 401/);
  });

  it('treats a network error as a hard failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('timeout'));
    const provider = new GroqJsonProvider({
      apiKey: 'groq-key',
      fetch: fetchMock,
    });

    const result = await provider.generate({
      consumerId: 'c',
      prompt: 'p',
      schema,
    });

    expect(result).toEqual({ outcome: 'ALL_PROVIDERS_UNAVAILABLE' });
  });

  it('treats a truncated (finish_reason: length) response as a hard failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => chatCompletion('{"action":"BUY"', 'length'),
    });
    const provider = new GroqJsonProvider({
      apiKey: 'groq-key',
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
      json: async () => chatCompletion('{not json'),
    });
    const provider = new GroqJsonProvider({
      apiKey: 'groq-key',
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
      json: async () => chatCompletion(''),
    });
    const provider = new GroqJsonProvider({
      apiKey: 'groq-key',
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
    const provider = new GroqJsonProvider({ fetch: fetchMock });

    const result = await provider.generate({
      consumerId: 'c',
      prompt: 'p',
      schema,
    });

    expect(result).toEqual({ outcome: 'ALL_PROVIDERS_UNAVAILABLE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
