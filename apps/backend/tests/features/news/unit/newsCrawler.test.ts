import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NewsCrawler } from '@/api/features/news/services/newsCrawler';
import type {
  NewsRepository,
  CreateNewsSourceData,
  UpdateNewsSourceData,
} from '@/api/features/news/repositories/interfaces/newsRepository.interface';
import type { DomainEventPublisher } from '@/api/features/marketData/application/interfaces/domainEventPublisher.interface';
import type { NewsProvider } from '@/api/features/news/services/interfaces/newsProvider.interface';
import type {
  NewsSource,
  RawNewsItem,
  NewsItem,
  NewsStats,
  NewsAnalytics,
  NewsSentiment,
  NewsCrawlAttempt,
  AnyDomainEvent,
  CrawlStatus,
} from '@crypto-strategy-lab/shared';
import { createAppLogger } from '@/utils/logger';

class FakeNewsRepository implements NewsRepository {
  public sources: NewsSource[] = [];
  public items: NewsItem[] = [];
  public attempts: NewsCrawlAttempt[] = [];

  public async findSources(onlyActive?: boolean): Promise<NewsSource[]> {
    return onlyActive ? this.sources.filter((s) => s.isActive) : this.sources;
  }
  public async findSourceById(id: string): Promise<NewsSource | null> {
    return this.sources.find((s) => s.id === id) ?? null;
  }
  public async findSourceByUrl(url: string): Promise<NewsSource | null> {
    return this.sources.find((s) => s.url === url) ?? null;
  }
  public async createSource(data: CreateNewsSourceData): Promise<NewsSource> {
    const s: NewsSource = {
      id: `src-${Date.now()}`,
      name: data.name,
      url: data.url,
      providerType: data.providerType,
      isActive: data.isActive ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.sources.push(s);
    return s;
  }
  public async updateSource(
    id: string,
    data: UpdateNewsSourceData,
  ): Promise<NewsSource> {
    const s = await this.findSourceById(id);
    if (!s) throw new Error('Not found');
    Object.assign(s, data);
    return s;
  }
  public async deleteSource(id: string): Promise<void> {
    this.sources = this.sources.filter((s) => s.id !== id);
  }
  public async findNewsItems(): Promise<{ items: NewsItem[]; total: number }> {
    return { items: this.items, total: this.items.length };
  }
  public async findNewsItemById(id: string): Promise<NewsItem | null> {
    return this.items.find((i) => i.id === id) ?? null;
  }
  public async persistRawNewsItems(
    rawItems: RawNewsItem[],
    newsSourceId?: string,
  ): Promise<{ persistedItems: NewsItem[]; skippedCount: number }> {
    const persisted: NewsItem[] = [];
    let skipped = 0;
    for (const r of rawItems) {
      if (this.items.some((i) => i.url === r.url)) {
        skipped++;
        continue;
      }
      const item: NewsItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: r.title,
        content: r.content,
        source: r.source,
        url: r.url,
        publishedAt: r.publishedAt.toISOString(),
        relatedCoins: r.relatedCoins ?? [],
        newsSourceId: newsSourceId ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.items.push(item);
      persisted.push(item);
    }
    return { persistedItems: persisted, skippedCount: skipped };
  }
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
    _events?: readonly AnyDomainEvent[],
  ): Promise<NewsItem[]> {
    const persisted: NewsItem[] = [];
    for (const update of updates) {
      const item = this.items.find(
        (candidate) => candidate.id === update.newsItemId,
      );
      if (!item) throw new Error('Not found');
      item.sentiment = update.sentiment;
      item.relatedCoins = update.relatedCoins;
      persisted.push(item);
    }
    return persisted;
  }
  public async recordCrawlAttempt(data: {
    newsSourceId: string;
    status: CrawlStatus;
    itemsFound: number;
    itemsPersisted: number;
    errorMessage?: string | null | undefined;
  }): Promise<NewsCrawlAttempt> {
    const attempt: NewsCrawlAttempt = {
      id: 'attempt-1',
      newsSourceId: data.newsSourceId,
      status: data.status,
      itemsFound: data.itemsFound,
      itemsPersisted: data.itemsPersisted,
      errorMessage: data.errorMessage ?? null,
      crawledAt: new Date().toISOString(),
    };
    this.attempts.push(attempt);
    return attempt;
  }
  public async getRecentCrawlAttempts(): Promise<NewsCrawlAttempt[]> {
    return this.attempts;
  }
  public async getNewsStats(_pair?: string): Promise<NewsStats> {
    return {
      totalItems: this.items.length,
      totalSources: this.sources.length,
      activeSources: this.sources.filter((s) => s.isActive).length,
      coveragePercent: 100,
    };
  }

  public async getNewsAnalytics(
    _pair?: string,
    _now?: Date,
  ): Promise<NewsAnalytics> {
    return {
      aggregate: {
        positive: 0,
        neutral: 0,
        negative: 0,
        score: 0,
        sampleSize: 0,
      },
      eventTypes: {
        ETF_FUND_FLOW: 0,
        PROTOCOL_UPGRADE: 0,
        REGULATION: 0,
        PARTNERSHIP: 0,
        MARKET_TREND: 0,
        OTHER: 0,
      },
      analyzedCount: 0,
    };
  }

  private settings = new Map<string, string>();

  public async getSetting(key: string): Promise<string | null> {
    return this.settings.get(key) ?? null;
  }

  public async setSetting(key: string, value: string): Promise<void> {
    this.settings.set(key, value);
  }
}

describe('NewsCrawler', () => {
  let repository: FakeNewsRepository;
  let eventPublisher: DomainEventPublisher;
  let publishedEvents: AnyDomainEvent[];
  let crawler: NewsCrawler;
  const logger = createAppLogger({ service: 'test', enabled: false });

  beforeEach(() => {
    repository = new FakeNewsRepository();
    publishedEvents = [];
    eventPublisher = {
      publish: vi.fn((event: AnyDomainEvent) => {
        publishedEvents.push(event);
      }),
    };
    crawler = new NewsCrawler({
      newsRepository: repository,
      eventPublisher,
      logger,
    });
  });

  it('should crawl source, persist items, and emit NewsCollected events', async () => {
    const fakeProvider: NewsProvider = {
      providerType: 'RSS',
      fetchNews: async () => [
        {
          title: 'Article 1',
          content: 'Content 1',
          url: 'https://example.com/1',
          publishedAt: new Date(),
          source: 'Test Source',
          relatedCoins: ['BTC'],
        },
        {
          title: 'Article 2',
          content: 'Content 2',
          url: 'https://example.com/2',
          publishedAt: new Date(),
          source: 'Test Source',
          relatedCoins: ['ETH'],
        },
      ],
    };
    crawler.registerProvider(fakeProvider);

    const source: NewsSource = {
      id: 'source-1',
      name: 'Test Source',
      url: 'https://example.com/rss',
      providerType: 'RSS',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await crawler.crawlSource(source);
    expect(result.status).toBe('SUCCESS');
    expect(result.itemsFound).toBe(2);
    expect(result.itemsPersisted).toBe(2);
    expect(repository.items).toHaveLength(2);
    expect(publishedEvents).toHaveLength(2);
    expect(publishedEvents[0]?.name).toBe('NewsCollected');
    if (publishedEvents[0]?.name === 'NewsCollected') {
      expect(publishedEvents[0].payload.provider).toBe('RSS');
    }
  });

  it('should deduplicate items on subsequent crawls', async () => {
    const fakeProvider: NewsProvider = {
      providerType: 'RSS',
      fetchNews: async () => [
        {
          title: 'Article 1',
          content: 'Content 1',
          url: 'https://example.com/1',
          publishedAt: new Date(),
          source: 'Test Source',
        },
      ],
    };
    crawler.registerProvider(fakeProvider);

    const source: NewsSource = {
      id: 'source-1',
      name: 'Test Source',
      url: 'https://example.com/rss',
      providerType: 'RSS',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // First crawl
    const res1 = await crawler.crawlSource(source);
    expect(res1.itemsPersisted).toBe(1);

    // Second crawl with same article
    const res2 = await crawler.crawlSource(source);
    expect(res2.itemsFound).toBe(1);
    expect(res2.itemsPersisted).toBe(0);
    expect(repository.items).toHaveLength(1);
    expect(publishedEvents).toHaveLength(1);
  });

  it('should handle source failure and log error attempt without throwing', async () => {
    const failingProvider: NewsProvider = {
      providerType: 'RSS',
      fetchNews: async () => {
        throw new Error('Network timeout');
      },
    };
    crawler.registerProvider(failingProvider);

    const source: NewsSource = {
      id: 'source-fail',
      name: 'Failing Source',
      url: 'https://example.com/bad',
      providerType: 'RSS',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await crawler.crawlSource(source);
    expect(result.status).toBe('FAILURE');
    expect(result.error).toContain('Network timeout');
    expect(repository.attempts).toHaveLength(1);
    expect(repository.attempts[0]?.status).toBe('FAILURE');
  });
});
