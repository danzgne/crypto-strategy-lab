import { describe, expect, it, vi } from 'vitest';

import type {
  AnyDomainEvent,
  NewsItem,
  NewsSentiment,
} from '@crypto-strategy-lab/shared';
import type {
  LlmJsonGenerateInput,
  LlmJsonGenerateResult,
  LlmJsonProvider,
} from '@/llm/llmJsonProvider.interface';
import { FallbackLlmJsonProvider } from '@/llm/fallbackLlmJsonProvider';
import {
  SentimentScoringService,
  type SentimentScoringRepository,
} from '@/api/features/news/services/sentimentScoringService';
import { createAppLogger } from '@/utils/logger';

function makeItem(id: string, relatedCoins: string[] = ['BTC']): NewsItem {
  return {
    id,
    title: `Headline ${id}`,
    content: `Article content ${id}`,
    source: 'Test Source',
    url: `https://example.com/${id}`,
    publishedAt: '2026-09-02T10:00:00.000Z',
    relatedCoins,
    createdAt: '2026-09-02T10:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
  };
}

class FakeSentimentRepository implements SentimentScoringRepository {
  public items: NewsItem[] = [makeItem('one'), makeItem('two', ['ETH'])];

  public persistedBatches: NewsSentiment[][] = [];

  public async findUnscoredNewsItems(limit: number): Promise<NewsItem[]> {
    return this.items
      .filter((item) => item.sentiment === null || item.sentiment === undefined)
      .slice(0, limit);
  }

  public async persistSentimentBatch(
    updates: readonly {
      newsItemId: string;
      sentiment: NewsSentiment;
      relatedCoins: string[];
    }[],
  ): Promise<NewsItem[]> {
    this.persistedBatches.push(
      updates.map((update) => ({
        ...update.sentiment,
      })),
    );
    const updated: NewsItem[] = [];
    for (const update of updates) {
      const item = this.items.find(
        (candidate) => candidate.id === update.newsItemId,
      );
      if (!item) throw new Error(`Missing item ${update.newsItemId}`);
      item.sentiment = update.sentiment;
      item.relatedCoins = update.relatedCoins;
      updated.push(item);
    }
    return updated;
  }
}

function providerReturning(
  result: LlmJsonGenerateResult<unknown>,
  name = 'fake',
): LlmJsonProvider {
  return {
    name,
    generate: vi.fn(
      async (
        _input: LlmJsonGenerateInput<unknown>,
      ): Promise<LlmJsonGenerateResult<unknown>> => result,
    ) as LlmJsonProvider['generate'],
  };
}

function successfulValues() {
  return [
    {
      id: 'one',
      label: 'POSITIVE' as const,
      score: 0.8,
      eventType: 'ETF_FUND_FLOW' as const,
      relatedCoins: ['BTC'],
    },
    {
      id: 'two',
      label: 'NEGATIVE' as const,
      score: -0.4,
      eventType: 'REGULATION' as const,
      relatedCoins: ['ETH'],
    },
  ];
}

describe('SentimentScoringService', () => {
  it('uses a top-level object for the LLM batch response schema', async () => {
    const repository = new FakeSentimentRepository();
    let receivedInput: LlmJsonGenerateInput<unknown> | undefined;
    const provider: LlmJsonProvider = {
      name: 'fake',
      generate: vi.fn(async (input: LlmJsonGenerateInput<unknown>) => {
        receivedInput = input;
        return { outcome: 'ALL_PROVIDERS_UNAVAILABLE' as const };
      }) as LlmJsonProvider['generate'],
    };
    const service = new SentimentScoringService({
      repository,
      llmProvider: provider,
      eventPublisher: { publish: vi.fn() },
      batchSize: 2,
      logger: createAppLogger({ service: 'test', enabled: false }),
    });

    await service.scoreUnscoredItems();

    if (receivedInput === undefined) {
      throw new Error('Sentiment provider was not called');
    }
    expect(receivedInput.schema.safeParse({ items: [] }).success).toBe(true);
    expect(receivedInput.schema.safeParse([]).success).toBe(false);
  });

  it('scores a bounded batch, normalizes coins, persists atomically, and emits one event per item', async () => {
    const repository = new FakeSentimentRepository();
    const publishedEvents: AnyDomainEvent[] = [];
    const provider = providerReturning({
      outcome: 'SUCCESS',
      generatedBy: 'fake',
      value: {
        items: [
          { ...successfulValues()[0], relatedCoins: ['btc', 'BTCUSDT'] },
          { ...successfulValues()[1], relatedCoins: ['eth'] },
        ],
      },
    });
    const service = new SentimentScoringService({
      repository,
      llmProvider: provider,
      eventPublisher: {
        publish: vi.fn(async (event: AnyDomainEvent) => {
          publishedEvents.push(event);
        }),
      },
      batchSize: 2,
      logger: createAppLogger({ service: 'test', enabled: false }),
    });

    const result = await service.scoreUnscoredItems();

    expect(result).toEqual({ scored: 2, failedBatches: 0 });
    expect(repository.persistedBatches).toHaveLength(1);
    expect(repository.items[0]?.sentiment).toEqual({
      label: 'POSITIVE',
      score: 0.8,
      eventType: 'ETF_FUND_FLOW',
    });
    expect(repository.items[0]?.relatedCoins).toEqual(['BTC']);
    expect(repository.items[1]?.relatedCoins).toEqual(['ETH']);
    expect(publishedEvents).toHaveLength(2);
    expect(publishedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'SentimentAnalyzed',
          version: 2,
          payload: expect.objectContaining({
            newsItemId: 'one',
            sentiment: 'POSITIVE',
            score: 0.8,
            eventType: 'ETF_FUND_FLOW',
            relatedCoins: ['BTC'],
          }),
        }),
      ]),
    );
  });

  it.each([
    ['hard failure', { outcome: 'ALL_PROVIDERS_UNAVAILABLE' as const }],
    [
      'schema failure',
      {
        outcome: 'SCHEMA_INVALID' as const,
        issues: [{ path: '0.id', message: 'missing' }],
      },
    ],
  ])('leaves the entire batch untouched on %s', async (_name, response) => {
    const repository = new FakeSentimentRepository();
    const publish = vi.fn();
    const service = new SentimentScoringService({
      repository,
      llmProvider: providerReturning(response),
      eventPublisher: { publish },
      batchSize: 2,
      logger: createAppLogger({ service: 'test', enabled: false }),
    });

    const result = await service.scoreUnscoredItems();

    expect(result).toEqual({ scored: 0, failedBatches: 1 });
    expect(repository.persistedBatches).toHaveLength(0);
    expect(repository.items.every((item) => !item.sentiment)).toBe(true);
    expect(publish).not.toHaveBeenCalled();
  });

  it('treats a response with the wrong ids or count as an invalid batch', async () => {
    const repository = new FakeSentimentRepository();
    const service = new SentimentScoringService({
      repository,
      llmProvider: providerReturning({
        outcome: 'SUCCESS',
        generatedBy: 'fake',
        value: {
          items: [
            {
              id: 'one',
              label: 'POSITIVE',
              score: 0.8,
              eventType: 'ETF_FUND_FLOW',
              relatedCoins: ['BTC'],
            },
          ],
        },
      }),
      eventPublisher: { publish: vi.fn() },
      batchSize: 2,
      logger: createAppLogger({ service: 'test', enabled: false }),
    });

    const result = await service.scoreUnscoredItems();

    expect(result).toEqual({ scored: 0, failedBatches: 1 });
    expect(repository.persistedBatches).toHaveLength(0);
  });

  it('uses the sentiment consumer identity and falls back after a hard provider failure', async () => {
    const repository = new FakeSentimentRepository();
    const primary = providerReturning(
      { outcome: 'ALL_PROVIDERS_UNAVAILABLE' },
      'primary',
    );
    const secondary = providerReturning(
      {
        outcome: 'SUCCESS',
        generatedBy: 'secondary',
        value: { items: successfulValues() },
      },
      'secondary',
    );
    const provider = new FallbackLlmJsonProvider({
      providers: [primary, secondary],
      cooldownMs: 60_000,
    });
    const service = new SentimentScoringService({
      repository,
      llmProvider: provider,
      eventPublisher: { publish: vi.fn() },
      batchSize: 2,
      logger: createAppLogger({ service: 'test', enabled: false }),
    });

    await service.scoreUnscoredItems();

    expect(primary.generate).toHaveBeenCalledWith(
      expect.objectContaining({ consumerId: 'sentiment' }),
    );
    expect(secondary.generate).toHaveBeenCalledWith(
      expect.objectContaining({ consumerId: 'sentiment' }),
    );
    expect(provider.getAvailability('strategy-generation')[0]).toMatchObject({
      available: true,
    });
  });

  it('does not fall back when the sentiment provider returns a schema-invalid batch', async () => {
    const repository = new FakeSentimentRepository();
    const primary = providerReturning({
      outcome: 'SCHEMA_INVALID',
      issues: [{ path: '0.id', message: 'missing' }],
    });
    const secondary = providerReturning({
      outcome: 'SUCCESS',
      generatedBy: 'secondary',
      value: { items: successfulValues() },
    });
    const service = new SentimentScoringService({
      repository,
      llmProvider: new FallbackLlmJsonProvider({
        providers: [primary, secondary],
      }),
      eventPublisher: { publish: vi.fn() },
      batchSize: 2,
      logger: createAppLogger({ service: 'test', enabled: false }),
    });

    const result = await service.scoreUnscoredItems();

    expect(result).toEqual({ scored: 0, failedBatches: 1 });
    expect(secondary.generate).not.toHaveBeenCalled();
    expect(repository.persistedBatches).toHaveLength(0);
  });
});
