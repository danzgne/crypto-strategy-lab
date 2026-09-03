import type { AppPrismaClient } from '@/database/prismaClient';
import type {
  NewsRepository,
  CreateNewsSourceData,
  UpdateNewsSourceData,
} from './interfaces/newsRepository.interface';
import type {
  NewsItem,
  NewsSource,
  NewsCrawlAttempt,
  RawNewsItem,
  NewsListFilterQuery,
  NewsStats,
  NewsAnalytics,
  NewsProviderType,
  CrawlStatus,
  NewsEventType,
  SentimentLabel,
  AnyDomainEvent,
} from '@crypto-strategy-lab/shared';
import {
  calculateSentimentAnalytics,
  normalizeBaseAsset,
  type ScoredNewsItemForAnalytics,
} from '../services/sentimentAnalytics';
import { isSourceHealthy } from '../services/sourceHealth';
import {
  CRAWL_INTERVAL_SETTING_KEY,
  parseRefreshIntervalMinutes,
} from '../services/refreshInterval';
import { Prisma } from '../../../../../../../generated/prisma/client';

function mapNewsSource(source: {
  id: string;
  name: string;
  url: string;
  providerType: NewsProviderType;
  isActive: boolean;
  config: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  crawlLogs?: Array<{
    id: string;
    newsSourceId: string;
    status: CrawlStatus;
    itemsFound: number;
    itemsPersisted: number;
    errorMessage: string | null;
    crawledAt: Date;
  }>;
}): NewsSource {
  const lastAttempt =
    source.crawlLogs && source.crawlLogs.length > 0 && source.crawlLogs[0]
      ? mapCrawlAttempt(source.crawlLogs[0])
      : undefined;

  return {
    id: source.id,
    name: source.name,
    url: source.url,
    providerType: source.providerType,
    isActive: source.isActive,
    config: (source.config as Record<string, unknown> | null) ?? null,
    lastCrawlAttempt: lastAttempt,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
  };
}

function mapNewsItem(item: {
  id: string;
  title: string;
  content: string;
  source: string;
  url: string;
  publishedAt: Date;
  relatedCoins: string[];
  sentimentLabel: SentimentLabel | null;
  sentimentScore: Prisma.Decimal | null;
  eventType: NewsEventType | null;
  newsSourceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): NewsItem {
  const sentiment =
    item.sentimentLabel !== null &&
    item.sentimentScore !== null &&
    item.eventType !== null
      ? {
          label: item.sentimentLabel,
          score: Number(item.sentimentScore),
          eventType: item.eventType,
        }
      : null;

  return {
    id: item.id,
    title: item.title,
    content: item.content,
    source: item.source,
    url: item.url,
    publishedAt: item.publishedAt.toISOString(),
    relatedCoins: item.relatedCoins,
    sentiment,
    newsSourceId: item.newsSourceId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function mapCrawlAttempt(attempt: {
  id: string;
  newsSourceId: string;
  status: CrawlStatus;
  itemsFound: number;
  itemsPersisted: number;
  errorMessage: string | null;
  templateVersionId?: string | null;
  emptyFieldRate?: Prisma.Decimal | null;
  malformedFieldRate?: Prisma.Decimal | null;
  avgConfidence?: Prisma.Decimal | null;
  crawledAt: Date;
}): NewsCrawlAttempt {
  return {
    id: attempt.id,
    newsSourceId: attempt.newsSourceId,
    status: attempt.status,
    itemsFound: attempt.itemsFound,
    itemsPersisted: attempt.itemsPersisted,
    errorMessage: attempt.errorMessage,
    templateVersionId: attempt.templateVersionId ?? null,
    emptyFieldRate:
      attempt.emptyFieldRate === null || attempt.emptyFieldRate === undefined
        ? null
        : Number(attempt.emptyFieldRate),
    malformedFieldRate:
      attempt.malformedFieldRate === null ||
      attempt.malformedFieldRate === undefined
        ? null
        : Number(attempt.malformedFieldRate),
    avgConfidence:
      attempt.avgConfidence === null || attempt.avgConfidence === undefined
        ? null
        : Number(attempt.avgConfidence),
    crawledAt: attempt.crawledAt.toISOString(),
  };
}

export class PrismaNewsRepository implements NewsRepository {
  public constructor(private readonly prisma: AppPrismaClient) {}

  public async findSources(onlyActive = false): Promise<NewsSource[]> {
    const where: Prisma.NewsSourceWhereInput = onlyActive
      ? { isActive: true }
      : {};
    const sources = await this.prisma.newsSource.findMany({
      where,
      include: {
        crawlLogs: {
          orderBy: { crawledAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return sources.map(mapNewsSource);
  }

  public async findSourceById(id: string): Promise<NewsSource | null> {
    const source = await this.prisma.newsSource.findUnique({
      where: { id },
      include: {
        crawlLogs: {
          orderBy: { crawledAt: 'desc' },
          take: 1,
        },
      },
    });
    return source ? mapNewsSource(source) : null;
  }

  public async findSourceByUrl(url: string): Promise<NewsSource | null> {
    const source = await this.prisma.newsSource.findFirst({
      where: { url },
      include: {
        crawlLogs: {
          orderBy: { crawledAt: 'desc' },
          take: 1,
        },
      },
    });
    return source ? mapNewsSource(source) : null;
  }

  public async createSource(data: CreateNewsSourceData): Promise<NewsSource> {
    const createData: Prisma.NewsSourceCreateInput = {
      name: data.name,
      url: data.url,
      providerType: data.providerType,
      isActive: data.isActive ?? true,
    };

    if (data.config !== undefined && data.config !== null) {
      createData.config = data.config as Prisma.InputJsonValue;
    }

    const source = await this.prisma.newsSource.create({
      data: createData,
    });
    return mapNewsSource(source);
  }

  public async updateSource(
    id: string,
    data: UpdateNewsSourceData,
  ): Promise<NewsSource> {
    const updateData: Prisma.NewsSourceUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.url !== undefined) updateData.url = data.url;
    if (data.providerType !== undefined)
      updateData.providerType = data.providerType;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.config !== undefined) {
      updateData.config =
        data.config === null
          ? Prisma.JsonNull
          : (data.config as Prisma.InputJsonValue);
    }

    const source = await this.prisma.newsSource.update({
      where: { id },
      data: updateData,
    });
    return mapNewsSource(source);
  }

  public async deleteSource(id: string): Promise<void> {
    await this.prisma.newsSource.delete({
      where: { id },
    });
  }

  public async findNewsItems(
    query: NewsListFilterQuery,
  ): Promise<{ items: NewsItem[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const andConditions: Prisma.NewsItemWhereInput[] = [];

    // Active source filter: only include items from active sources or direct manual ingest
    if (query.providerType) {
      if (query.providerType === 'HTML') {
        andConditions.push({
          OR: [
            { newsSource: { providerType: 'HTML', isActive: true } },
            { newsSourceId: null },
          ],
        });
      } else {
        andConditions.push({
          newsSource: { providerType: query.providerType, isActive: true },
        });
      }
    } else {
      andConditions.push({
        OR: [{ newsSource: { isActive: true } }, { newsSourceId: null }],
      });
    }

    if (query.source) {
      andConditions.push({
        source: { contains: query.source, mode: 'insensitive' },
      });
    }

    if (query.coin) {
      andConditions.push({
        relatedCoins: { has: query.coin.toUpperCase() },
      });
    }

    const where: Prisma.NewsItemWhereInput =
      andConditions.length > 0 ? { AND: andConditions } : {};

    const [items, total] = await Promise.all([
      this.prisma.newsItem.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.newsItem.count({ where }),
    ]);

    return {
      items: items.map(mapNewsItem),
      total,
    };
  }

  public async findNewsItemById(id: string): Promise<NewsItem | null> {
    const item = await this.prisma.newsItem.findUnique({
      where: { id },
    });
    return item ? mapNewsItem(item) : null;
  }

  public async persistRawNewsItems(
    items: RawNewsItem[],
    newsSourceId?: string,
  ): Promise<{ persistedItems: NewsItem[]; skippedCount: number }> {
    if (items.length === 0) {
      return { persistedItems: [], skippedCount: 0 };
    }

    // Deduplicate items within the incoming batch
    const uniqueItemsMap = new Map<string, RawNewsItem>();
    for (const item of items) {
      if (!uniqueItemsMap.has(item.url)) {
        uniqueItemsMap.set(item.url, item);
      }
    }
    const uniqueItems = Array.from(uniqueItemsMap.values());
    let skipped = items.length - uniqueItems.length;

    // Batch query existing URLs in single database roundtrip
    const urls = uniqueItems.map((i) => i.url);
    const existingRecords = await this.prisma.newsItem.findMany({
      where: { url: { in: urls } },
      select: { url: true },
    });
    const existingUrls = new Set(existingRecords.map((r) => r.url));

    const toCreate = uniqueItems.filter((i) => !existingUrls.has(i.url));
    skipped += uniqueItems.length - toCreate.length;

    const persisted: NewsItem[] = [];

    if (toCreate.length > 0) {
      await this.prisma.newsItem.createMany({
        data: toCreate.map((item) => ({
          title: item.title,
          content: item.content,
          source: item.source,
          url: item.url,
          publishedAt: item.publishedAt,
          relatedCoins: item.relatedCoins ?? [],
          newsSourceId: newsSourceId ?? null,
        })),
        skipDuplicates: true,
      });

      const newlyCreated = await this.prisma.newsItem.findMany({
        where: { url: { in: toCreate.map((i) => i.url) } },
      });

      for (const created of newlyCreated) {
        persisted.push(mapNewsItem(created));
      }
    }

    return { persistedItems: persisted, skippedCount: skipped };
  }

  public async findUnscoredNewsItems(limit: number): Promise<NewsItem[]> {
    const items = await this.prisma.newsItem.findMany({
      where: {
        sentimentLabel: null,
        sentimentScore: null,
        eventType: null,
      },
      orderBy: { publishedAt: 'desc' },
      take: Math.max(1, Math.floor(limit)),
    });
    return items.map(mapNewsItem);
  }

  public async persistSentimentBatch(
    updates: readonly {
      newsItemId: string;
      sentiment: {
        label: SentimentLabel;
        score: number;
        eventType: NewsEventType;
      };
      relatedCoins: string[];
    }[],
    events: readonly AnyDomainEvent[] = [],
  ): Promise<NewsItem[]> {
    return this.prisma.$transaction(async (transaction) => {
      if (events.length !== 0 && events.length !== updates.length) {
        throw new Error(
          'Sentiment updates and events must have matching counts',
        );
      }
      const persisted: NewsItem[] = [];
      for (const update of updates) {
        const changed = await transaction.newsItem.updateMany({
          where: {
            id: update.newsItemId,
            sentimentLabel: null,
            sentimentScore: null,
            eventType: null,
          },
          data: {
            sentimentLabel: update.sentiment.label,
            sentimentScore: update.sentiment.score,
            eventType: update.sentiment.eventType,
            relatedCoins: update.relatedCoins,
          },
        });
        if (changed.count === 0) {
          throw new Error(
            `News item was already scored or missing: ${update.newsItemId}`,
          );
        }

        const item = await transaction.newsItem.findUnique({
          where: { id: update.newsItemId },
        });
        if (!item) {
          throw new Error(
            `News item disappeared during sentiment scoring: ${update.newsItemId}`,
          );
        }
        persisted.push(mapNewsItem(item));
      }
      for (const event of events) {
        await transaction.outboxEvent.create({
          data: {
            eventId: event.eventId,
            name: event.name,
            occurredAt: new Date(event.occurredAt),
            payload: event.payload as unknown as Prisma.InputJsonValue,
            version: event.version,
          },
        });
      }
      return persisted;
    });
  }

  public async recordCrawlAttempt(data: {
    newsSourceId: string;
    status: CrawlStatus;
    itemsFound: number;
    itemsPersisted: number;
    errorMessage?: string | null | undefined;
    templateVersionId?: string | null | undefined;
    emptyFieldRate?: number | null | undefined;
    malformedFieldRate?: number | null | undefined;
    avgConfidence?: number | null | undefined;
  }): Promise<NewsCrawlAttempt> {
    const attempt = await this.prisma.newsCrawlAttempt.create({
      data: {
        newsSourceId: data.newsSourceId,
        status: data.status,
        itemsFound: data.itemsFound,
        itemsPersisted: data.itemsPersisted,
        errorMessage: data.errorMessage ?? null,
        templateVersionId: data.templateVersionId ?? null,
        emptyFieldRate: data.emptyFieldRate ?? null,
        malformedFieldRate: data.malformedFieldRate ?? null,
        avgConfidence: data.avgConfidence ?? null,
      },
    });
    return mapCrawlAttempt(attempt);
  }

  public async getRecentCrawlAttempts(limit = 50): Promise<NewsCrawlAttempt[]> {
    const attempts = await this.prisma.newsCrawlAttempt.findMany({
      orderBy: { crawledAt: 'desc' },
      take: limit,
    });
    return attempts.map(mapCrawlAttempt);
  }

  public async getNewsStats(pair?: string): Promise<NewsStats> {
    const activeNewsFilter: Prisma.NewsItemWhereInput = {
      OR: [{ newsSource: { isActive: true } }, { newsSourceId: null }],
    };

    const [
      totalItems,
      totalSources,
      enabledSourceRows,
      refreshIntervalSetting,
      analytics,
    ] = await Promise.all([
      this.prisma.newsItem.count({ where: activeNewsFilter }),
      this.prisma.newsSource.count(),
      this.prisma.newsSource.findMany({
        where: { isActive: true },
        include: { crawlLogs: { orderBy: { crawledAt: 'desc' }, take: 1 } },
      }),
      this.prisma.systemSetting.findUnique({
        where: { key: CRAWL_INTERVAL_SETTING_KEY },
      }),
      this.getNewsAnalytics(pair),
    ]);

    const refreshIntervalMinutes = parseRefreshIntervalMinutes(
      refreshIntervalSetting?.value,
    );

    const now = new Date();
    const enabledSources = enabledSourceRows.length;
    const activeSources = enabledSourceRows.filter((source) => {
      const lastAttempt = source.crawlLogs[0];
      return isSourceHealthy(
        lastAttempt
          ? {
              status: lastAttempt.status,
              crawledAt: lastAttempt.crawledAt.toISOString(),
            }
          : null,
        refreshIntervalMinutes,
        now,
      );
    }).length;

    const coveragePercent =
      enabledSources > 0
        ? Math.round((activeSources / enabledSources) * 100)
        : 0;

    return {
      totalItems,
      totalSources,
      enabledSources,
      activeSources,
      coveragePercent,
      analytics,
    };
  }

  public async getNewsAnalytics(
    pair?: string,
    now = new Date(),
  ): Promise<NewsAnalytics> {
    const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
    const items = await this.prisma.newsItem.findMany({
      where: {
        publishedAt: { gte: windowStart, lte: now },
        sentimentLabel: { not: null },
        sentimentScore: { not: null },
        eventType: { not: null },
      },
    });

    const scoredItems: ScoredNewsItemForAnalytics[] = items.flatMap((item) => {
      if (
        item.sentimentLabel === null ||
        item.sentimentScore === null ||
        item.eventType === null
      ) {
        return [];
      }
      return [
        {
          publishedAt: item.publishedAt.toISOString(),
          relatedCoins: item.relatedCoins.map(normalizeBaseAsset),
          sentiment: {
            label: item.sentimentLabel,
            score: Number(item.sentimentScore),
            eventType: item.eventType,
          },
        },
      ];
    });

    return calculateSentimentAnalytics(scoredItems, pair, now);
  }

  public async getSetting(key: string): Promise<string | null> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key },
    });
    return setting ? setting.value : null;
  }

  public async setSetting(key: string, value: string): Promise<void> {
    await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}
