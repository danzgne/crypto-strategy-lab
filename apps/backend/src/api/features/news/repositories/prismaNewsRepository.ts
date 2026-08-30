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
  NewsProviderType,
  CrawlStatus,
} from '@crypto-strategy-lab/shared';
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
}): NewsSource {
  return {
    id: source.id,
    name: source.name,
    url: source.url,
    providerType: source.providerType,
    isActive: source.isActive,
    config: (source.config as Record<string, unknown> | null) ?? null,
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
  newsSourceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): NewsItem {
  return {
    id: item.id,
    title: item.title,
    content: item.content,
    source: item.source,
    url: item.url,
    publishedAt: item.publishedAt.toISOString(),
    relatedCoins: item.relatedCoins,
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
  crawledAt: Date;
}): NewsCrawlAttempt {
  return {
    id: attempt.id,
    newsSourceId: attempt.newsSourceId,
    status: attempt.status,
    itemsFound: attempt.itemsFound,
    itemsPersisted: attempt.itemsPersisted,
    errorMessage: attempt.errorMessage,
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
      orderBy: { createdAt: 'asc' },
    });
    return sources.map(mapNewsSource);
  }

  public async findSourceById(id: string): Promise<NewsSource | null> {
    const source = await this.prisma.newsSource.findUnique({
      where: { id },
    });
    return source ? mapNewsSource(source) : null;
  }

  public async findSourceByUrl(url: string): Promise<NewsSource | null> {
    const source = await this.prisma.newsSource.findFirst({
      where: { url },
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

    const where: Prisma.NewsItemWhereInput = {};

    if (query.source) {
      where.source = { contains: query.source, mode: 'insensitive' };
    }

    if (query.providerType) {
      if (query.providerType === 'HTML') {
        where.OR = [
          { newsSource: { providerType: 'HTML' } },
          { newsSourceId: null },
        ];
      } else {
        where.newsSource = { providerType: query.providerType };
      }
    }

    if (query.coin) {
      where.relatedCoins = { has: query.coin.toUpperCase() };
    }

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

  public async recordCrawlAttempt(data: {
    newsSourceId: string;
    status: CrawlStatus;
    itemsFound: number;
    itemsPersisted: number;
    errorMessage?: string | null | undefined;
  }): Promise<NewsCrawlAttempt> {
    const attempt = await this.prisma.newsCrawlAttempt.create({
      data: {
        newsSourceId: data.newsSourceId,
        status: data.status,
        itemsFound: data.itemsFound,
        itemsPersisted: data.itemsPersisted,
        errorMessage: data.errorMessage ?? null,
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

  public async getNewsStats(): Promise<NewsStats> {
    const [totalItems, totalSources, activeSources] = await Promise.all([
      this.prisma.newsItem.count(),
      this.prisma.newsSource.count(),
      this.prisma.newsSource.count({ where: { isActive: true } }),
    ]);

    const coveragePercent =
      totalSources > 0 ? Math.round((activeSources / totalSources) * 100) : 0;

    return {
      totalItems,
      totalSources,
      activeSources,
      coveragePercent,
    };
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
